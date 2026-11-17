import {
  DISCLAIMER,
  MAX_FLOOR_PLANS_PER_LISTING,
  MAX_PHOTOS_PER_LISTING,
  REPORT_SCHEMA_VERSION,
  type CrossCheck,
  type Listing,
  type PhotoReport,
  type Report,
} from "@aiview/shared";
import { cacheKeyFor } from "./cacheKey";
import { checkDisclosure } from "./disclosure";
import { FLOOR_PLAN_MAX_EDGE, PHOTO_MAX_EDGE, prepareImages, type ImageLoader } from "./images";
import type { ModelOutput, VisionAnalyser } from "./modelOutput";
import { deriveStatus } from "./status";
import { safeCrossCheckEvidence, safeFindingEvidence } from "./wording";

export interface AnalysisDeps {
  vision: VisionAnalyser;
  loadImage: ImageLoader;
  /** Recorded on the report so results can be traced to a model. */
  model: string;
  maxPhotos: number;
  /** Origin of the web app, for the "Report an error" link. */
  siteUrl: string;
  now?: () => Date;
}

/** None of the listing's photos could be loaded, so there is nothing to analyse. */
export class NoPhotosError extends Error {
  constructor() {
    super("None of the listing's photos could be loaded.");
    this.name = "NoPhotosError";
  }
}

export function reportErrorUrl(siteUrl: string, cacheKey: string): string {
  return `${siteUrl.replace(/\/$/, "")}/report-error?ref=${encodeURIComponent(cacheKey)}`;
}

/** Turns the model's reply into report sections, dropping anything that refers to photos it was not shown. */
function buildFindings(
  listing: Listing,
  analysedIndexes: readonly number[],
  output: ModelOutput,
): { photos: PhotoReport[]; crossChecks: CrossCheck[] } {
  const analysed = new Set(analysedIndexes);
  const byIndex = new Map<number, PhotoReport>();
  for (const index of analysedIndexes) {
    const photo = listing.photos[index]!;
    byIndex.set(index, { index, url: photo.url, caption: photo.caption, findings: [] });
  }

  for (const entry of output.photos) {
    const target = byIndex.get(entry.photo - 1);
    if (target === undefined) continue;
    for (const finding of entry.findings) {
      target.findings.push({
        category: finding.category,
        confidence: finding.confidence,
        evidence: safeFindingEvidence(finding.evidence, finding.category, listing.agentName),
      });
    }
  }

  const crossChecks = output.crossChecks.map((check) => ({
    type: check.type,
    confidence: check.confidence,
    evidence: safeCrossCheckEvidence(check.evidence, check.type, listing.agentName),
    photoIndexes: [...new Set(check.photos.map((photo) => photo - 1))]
      .filter((index) => analysed.has(index))
      .sort((a, b) => a - b),
  }));

  return { photos: [...byIndex.values()], crossChecks };
}

/** Runs the whole analysis for one listing. No caching or rate limiting here. */
export async function analyseListing(listing: Listing, deps: AnalysisDeps): Promise<Report> {
  const maxPhotos = Math.max(1, Math.min(deps.maxPhotos, MAX_PHOTOS_PER_LISTING));
  const disclosure = checkDisclosure(listing);

  const [photos, floorPlans] = await Promise.all([
    prepareImages(listing.photos.slice(0, maxPhotos), PHOTO_MAX_EDGE, deps.loadImage),
    prepareImages(
      listing.floorPlans.slice(0, MAX_FLOOR_PLANS_PER_LISTING),
      FLOOR_PLAN_MAX_EDGE,
      deps.loadImage,
    ),
  ]);
  if (photos.length === 0) throw new NoPhotosError();

  const output = await deps.vision({ listing, photos, floorPlans });
  const findings = buildFindings(
    listing,
    photos.map((photo) => photo.index),
    output,
  );

  const cacheKey = cacheKeyFor(listing);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    cacheKey,
    portal: listing.portal,
    listingId: listing.listingId,
    listingUrl: listing.url,
    status: deriveStatus(
      findings.photos.flatMap((photo) => photo.findings),
      findings.crossChecks,
      disclosure,
    ),
    disclosure,
    photos: findings.photos,
    crossChecks: findings.crossChecks,
    photosTotal: listing.photos.length,
    photosAnalysed: photos.length,
    floorPlansAnalysed: floorPlans.length,
    viewerPhotos: [],
    disclaimer: DISCLAIMER,
    reportErrorUrl: reportErrorUrl(deps.siteUrl, cacheKey),
    model: deps.model,
    analysedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}

/**
 * Adapts a cached report to the listing in the current request.
 *
 * The cache holds what the model saw in the images. Everything that depends
 * on listing text is worked out again from the caller's own copy of the
 * page: the disclosure check, the status, captions and photo numbering. So
 * one caller cannot change what another sees by submitting altered text.
 */
export function refreshReport(report: Report, listing: Listing): Report {
  const positions = new Map(listing.photos.map((photo, index) => [photo.url, index] as const));
  const renumbered = new Map<number, number>();

  const photos: PhotoReport[] = [];
  for (const photo of report.photos) {
    const index = positions.get(photo.url);
    if (index === undefined) continue;
    renumbered.set(photo.index, index);
    photos.push({
      index,
      url: photo.url,
      caption: listing.photos[index]!.caption,
      findings: photo.findings.map((finding) => ({
        ...finding,
        evidence: safeFindingEvidence(finding.evidence, finding.category, listing.agentName),
      })),
    });
  }
  photos.sort((a, b) => a.index - b.index);

  const crossChecks = report.crossChecks.map((check) => ({
    ...check,
    evidence: safeCrossCheckEvidence(check.evidence, check.type, listing.agentName),
    photoIndexes: check.photoIndexes
      .map((index) => renumbered.get(index))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b),
  }));

  const disclosure = checkDisclosure(listing);
  return {
    ...report,
    listingUrl: listing.url,
    disclosure,
    photos,
    crossChecks,
    photosTotal: listing.photos.length,
    status: deriveStatus(
      photos.flatMap((photo) => photo.findings),
      crossChecks,
      disclosure,
    ),
  };
}
