import {
  INSTALL_ID_PATTERN,
  ListingSchema,
  isPortalImageUrl,
  isPortalPageUrl,
  type AnalyseResponse,
  type ApiErrorCode,
  type Listing,
  type Report,
} from "@aiview/shared";
import { cacheKeyFor } from "./analysis/cacheKey";
import { NoPhotosError } from "./analysis/pipeline";
import type { ReportStore } from "./store/types";

export interface ServiceDeps {
  store: ReportStore;
  /** Runs the full analysis for a listing that is not in the cache. */
  analyse: (listing: Listing) => Promise<Report>;
  dailyLimit: number;
}

export interface AnalyseRequest {
  body: unknown;
  installId: string | null;
  cacheOnly: boolean;
}

/**
 * Either an answer that is ready now, or an analysis that has been started
 * and will take a while. The route streams the second kind.
 */
export type AnalyseOutcome =
  | { kind: "ready"; status: number; body: AnalyseResponse }
  | { kind: "pending"; result: Promise<AnalyseResponse> };

function failure(status: number, code: ApiErrorCode, message: string): AnalyseOutcome {
  return { kind: "ready", status, body: { ok: false, error: { code, message } } };
}

/** Rejects listings whose URLs do not belong to the portal they claim. */
function hostProblem(listing: Listing): string | null {
  if (!isPortalPageUrl(listing.portal, listing.url)) {
    return "The listing URL does not belong to the stated portal.";
  }
  const images = [...listing.photos, ...listing.floorPlans];
  if (images.some((image) => !isPortalImageUrl(listing.portal, image.url))) {
    return "Photo URLs must be served by the listing's portal.";
  }
  return null;
}

// Analyses starting or running in this server instance, so simultaneous
// requests for the same listing share one model call.
const inFlight = new Map<string, Promise<AnalyseOutcome>>();

async function runAnalysis(
  listing: Listing,
  installId: string,
  deps: ServiceDeps,
): Promise<AnalyseResponse> {
  try {
    const report = await deps.analyse(listing);
    await deps.store.saveReport(listing, report);
    return { ok: true, report, cached: false };
  } catch (error) {
    // A failed analysis should not cost the user one of their daily checks.
    await deps.store.refundQuota(installId).catch(() => undefined);
    if (error instanceof NoPhotosError) {
      return {
        ok: false,
        error: { code: "no_photos", message: "The listing's photos could not be loaded." },
      };
    }
    console.error("[analyse] analysis failed:", error);
    return {
      ok: false,
      error: {
        code: "analysis_failed",
        message: "The analysis could not be completed. Please try again later.",
      },
    };
  }
}

export async function handleAnalyse(
  request: AnalyseRequest,
  deps: ServiceDeps,
): Promise<AnalyseOutcome> {
  const parsed = ListingSchema.safeParse(request.body);
  if (!parsed.success) {
    return failure(400, "invalid_request", "The request body is not a valid listing.");
  }
  const listing = parsed.data;

  const problem = hostProblem(listing);
  if (problem !== null) return failure(400, "invalid_request", problem);

  // Cache first: a listing already analysed costs nothing and is not rate limited.
  const cacheKey = cacheKeyFor(listing);
  const cached = await deps.store.getReport(cacheKey);
  if (cached !== null) {
    return { kind: "ready", status: 200, body: { ok: true, report: cached, cached: true } };
  }

  if (request.cacheOnly) {
    return failure(404, "not_analysed", "This listing has not been analysed yet.");
  }
  if (listing.photos.length === 0) {
    return failure(422, "no_photos", "This listing has no photos to analyse.");
  }
  if (request.installId === null || !INSTALL_ID_PATTERN.test(request.installId)) {
    return failure(400, "invalid_request", "A valid install ID header is required.");
  }

  // Join an analysis of this listing that is already starting or running. If
  // that request turned out to be refused (its own rate limit), try under ours.
  for (let running = inFlight.get(cacheKey); running; running = inFlight.get(cacheKey)) {
    const outcome = await running;
    if (outcome.kind === "pending") return outcome;
  }

  const started = start(listing, cacheKey, request.installId, deps);
  inFlight.set(cacheKey, started);
  return started;
}

async function start(
  listing: Listing,
  cacheKey: string,
  installId: string,
  deps: ServiceDeps,
): Promise<AnalyseOutcome> {
  let allowed: boolean;
  try {
    allowed = await deps.store.consumeQuota(installId, deps.dailyLimit);
  } catch (error) {
    inFlight.delete(cacheKey);
    throw error;
  }
  if (!allowed) {
    inFlight.delete(cacheKey);
    return failure(
      429,
      "rate_limited",
      `You have used today's ${deps.dailyLimit} new checks. Listings that were already checked are still available.`,
    );
  }

  const result = runAnalysis(listing, installId, deps).finally(() => {
    inFlight.delete(cacheKey);
  });
  return { kind: "pending", result };
}
