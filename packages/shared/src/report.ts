import { z } from "zod";
import { PortalSchema } from "./portals";

export const REPORT_SCHEMA_VERSION = 1;

/** Shown on every report. Legal requirement: do not reword casually. */
export const DISCLAIMER =
  "Automated analysis. It can be wrong. Always view the property in person.";

export const FindingCategorySchema = z.enum([
  "cosmetic",
  "staging",
  "structural",
  "concealment",
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FindingSchema = z.object({
  category: FindingCategorySchema,
  /** One plain sentence describing what is visible. */
  evidence: z.string(),
  confidence: ConfidenceSchema,
});
export type Finding = z.infer<typeof FindingSchema>;

export const PhotoReportSchema = z.object({
  /** Position in the listing's photo order, starting at 0. */
  index: z.number().int().nonnegative(),
  url: z.url(),
  caption: z.string().nullable(),
  findings: z.array(FindingSchema),
});
export type PhotoReport = z.infer<typeof PhotoReportSchema>;

export const CrossCheckTypeSchema = z.enum([
  /** Two photos of the same room disagree with each other. */
  "photo_inconsistency",
  /** Window or door counts differ between photos and the floor plan. */
  "floorplan_openings",
  /** A room looks a different size from the floor plan's dimensions. */
  "floorplan_dimensions",
  /** Wide-angle lens distortion making a room look larger. */
  "wide_angle",
]);
export type CrossCheckType = z.infer<typeof CrossCheckTypeSchema>;

export const CrossCheckSchema = z.object({
  type: CrossCheckTypeSchema,
  evidence: z.string(),
  confidence: ConfidenceSchema,
  /** Photos the observation refers to (indexes into the listing's photos). */
  photoIndexes: z.array(z.number().int().nonnegative()),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;

export const DisclosureSourceSchema = z.enum([
  "description",
  "key_features",
  "photo_caption",
]);
export type DisclosureSource = z.infer<typeof DisclosureSourceSchema>;

export const DisclosureMatchSchema = z.object({
  /** The disclosure wording that was found, as written in the listing. */
  term: z.string(),
  source: DisclosureSourceSchema,
  /** A short stretch of the surrounding text. */
  excerpt: z.string(),
});
export type DisclosureMatch = z.infer<typeof DisclosureMatchSchema>;

export const DisclosureSchema = z.object({
  status: z.enum(["disclosed", "not_disclosed"]),
  matches: z.array(DisclosureMatchSchema),
});
export type Disclosure = z.infer<typeof DisclosureSchema>;

export const OverallStatusSchema = z.enum([
  "no_concerns",
  "enhanced_disclosed",
  "enhanced_not_disclosed",
  "possible_structural_or_concealment",
]);
export type OverallStatus = z.infer<typeof OverallStatusSchema>;

/** A photo taken at a viewing and approved by moderation (phase 4). */
export const ViewerPhotoSchema = z.object({
  id: z.string(),
  url: z.url(),
  uploadedAt: z.string(),
});
export type ViewerPhoto = z.infer<typeof ViewerPhotoSchema>;

export const ReportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  cacheKey: z.string(),
  portal: PortalSchema,
  listingId: z.string(),
  listingUrl: z.url(),
  /** Derived in code from the findings and the disclosure check. */
  status: OverallStatusSchema,
  disclosure: DisclosureSchema,
  /** One entry per analysed photo, including photos with no findings. */
  photos: z.array(PhotoReportSchema),
  crossChecks: z.array(CrossCheckSchema),
  /** Photos in the listing. */
  photosTotal: z.number().int().nonnegative(),
  /** Photos the model actually saw (capped, and minus any that failed to load). */
  photosAnalysed: z.number().int().nonnegative(),
  floorPlansAnalysed: z.number().int().nonnegative(),
  viewerPhotos: z.array(ViewerPhotoSchema),
  disclaimer: z.literal(DISCLAIMER),
  reportErrorUrl: z.string(),
  model: z.string(),
  analysedAt: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;
