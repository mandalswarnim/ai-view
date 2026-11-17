import { join } from "node:path";
import { MAX_PHOTOS_PER_LISTING } from "@aiview/shared";
import { fetchImage } from "./analysis/images";
import type { AnalysisDeps } from "./analysis/pipeline";
import { createAnthropicVision, mockVision } from "./analysis/vision";
import { LocalStore } from "./store/local";
import { SupabaseStore } from "./store/supabase";
import type { ReportStore } from "./store/types";

export const DEFAULT_MODEL = "claude-opus-5-5";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function contactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";
}

export function dailyLimit(): number {
  return positiveInt(process.env.ANALYSES_PER_DAY, 10);
}

/** Ceiling on new analyses per day across all installs, to cap model spend. */
export function globalDailyLimit(): number {
  return positiveInt(process.env.MAX_ANALYSES_PER_DAY_TOTAL, 200);
}

export function mockMode(): boolean {
  return process.env.AIVIEW_MOCK_VISION === "1";
}

/** Explains what is missing when the server cannot run analyses, else null. */
export function analysisUnavailable(): string | null {
  if (mockMode() || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return "This server has no Anthropic API key. Add ANTHROPIC_API_KEY to apps/web/.env.local and restart, or set AIVIEW_MOCK_VISION=1 to try it without one.";
}

/** Model and limits for the analysis, read from the environment. */
export function analysisDeps(options: { mock?: boolean } = {}): AnalysisDeps {
  const mock = options.mock ?? mockMode();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  return {
    vision: mock ? mockVision : createAnthropicVision(model),
    loadImage: fetchImage,
    model: mock ? "mock" : model,
    maxPhotos: Math.min(positiveInt(process.env.MAX_PHOTOS, MAX_PHOTOS_PER_LISTING), MAX_PHOTOS_PER_LISTING),
    siteUrl: siteUrl(),
  };
}

// Kept on globalThis so Next's dev-mode module reloads share one store.
const globals = globalThis as { __aiviewStore?: ReportStore };

export function reportStore(): ReportStore {
  if (globals.__aiviewStore) return globals.__aiviewStore;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    globals.__aiviewStore = new SupabaseStore(url, key);
  } else {
    if (process.env.VERCEL) {
      console.error("[store] Supabase is not configured; reports will not persist on Vercel.");
    }
    globals.__aiviewStore = new LocalStore(join(process.cwd(), ".data", "store.json"));
  }
  return globals.__aiviewStore;
}
