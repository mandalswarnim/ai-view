import { z } from "zod";
import { ReportSchema } from "./report";

/** Header carrying the anonymous install ID used for rate limiting. */
export const INSTALL_ID_HEADER = "x-install-id";
export const INSTALL_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

/** Query flag: return the cached report or `not_analysed`, never start an analysis. */
export const CACHE_ONLY_PARAM = "cacheOnly";

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "not_analysed",
  "rate_limited",
  "no_photos",
  /** The server has no model credentials. */
  "not_configured",
  "analysis_failed",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/**
 * Body of every /api/analyse response. A slow analysis is answered with a
 * 200 whose body is padded with whitespace until the result is ready, so
 * callers must check `ok` rather than rely on the HTTP status alone.
 */
export const AnalyseResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    report: ReportSchema,
    /** True when the report came from the cache. */
    cached: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: ApiErrorCodeSchema, message: z.string() }),
  }),
]);
export type AnalyseResponse = z.infer<typeof AnalyseResponseSchema>;
