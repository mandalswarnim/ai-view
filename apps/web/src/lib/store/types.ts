import type { Listing, Report } from "@aiview/shared";

/** Where reports are cached and new-analysis quota is counted. */
export interface ReportStore {
  getReport(cacheKey: string): Promise<Report | null>;
  saveReport(listing: Listing, report: Report): Promise<void>;
  /**
   * Counts one new analysis against today's allowance for this install.
   * Returns false, counting nothing, when the allowance is already used up.
   */
  consumeQuota(installId: string, dailyLimit: number): Promise<boolean>;
  /** Gives back one unit after an analysis that failed. */
  refundQuota(installId: string): Promise<void>;
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
