import { CACHE_ONLY_PARAM, INSTALL_ID_HEADER, type AnalyseResponse } from "@aiview/shared";
import { handleAnalyse } from "@/lib/analyseService";
import { analyseListing } from "@/lib/analysis/pipeline";
import {
  analysisDeps,
  analysisUnavailable,
  dailyLimit,
  globalDailyLimit,
  reportStore,
} from "@/lib/config";
import { heartbeatJson } from "@/lib/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 20-photo analysis can take a minute or two.
export const maxDuration = 300;

const MAX_BODY_BYTES = 512 * 1024;

function json(status: number, body: AnalyseResponse): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** POST a Listing, get back its Report. See AnalyseResponse for the body. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("too large");
    body = JSON.parse(text);
  } catch {
    return json(400, {
      ok: false,
      error: { code: "invalid_request", message: "The request body must be JSON." },
    });
  }

  let outcome;
  try {
    outcome = await handleAnalyse(
      {
        body,
        installId: request.headers.get(INSTALL_ID_HEADER),
        cacheOnly: new URL(request.url).searchParams.get(CACHE_ONLY_PARAM) === "1",
      },
      {
        store: reportStore(),
        analyse: (listing) => analyseListing(listing, analysisDeps()),
        dailyLimit: dailyLimit(),
        globalDailyLimit: globalDailyLimit(),
        unavailable: analysisUnavailable,
      },
    );
  } catch (error) {
    // The cache or rate-limit store is unreachable.
    console.error("[analyse] request failed:", error);
    return json(500, {
      ok: false,
      error: { code: "analysis_failed", message: "The service is unavailable. Please try again later." },
    });
  }

  return outcome.kind === "ready"
    ? json(outcome.status, outcome.body)
    : heartbeatJson(outcome.result);
}
