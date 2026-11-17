import type { ApiErrorCode, Listing, Report } from "@aiview/shared";

/** Content script -> background: look up or start an analysis. */
export interface AnalyseMessage {
  type: "aiview/analyse";
  listing: Listing;
  /** When true, only a cached report is returned; nothing new is analysed. */
  cacheOnly: boolean;
}

/** Content script -> background while waiting, so the worker is not put to sleep. */
export interface PingMessage {
  type: "aiview/ping";
}

export type ExtensionMessage = AnalyseMessage | PingMessage;

export type AnalyseReply =
  | { ok: true; report: Report; cached: boolean }
  | { ok: false; error: { code: ApiErrorCode | "network"; message: string } };

export const API_BASE_URL: string = (
  import.meta.env.WXT_API_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
