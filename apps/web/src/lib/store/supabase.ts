import { ReportSchema, type Listing, type Report } from "@aiview/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ReportStore } from "./types";

/**
 * Production store. Uses the service-role key, so it must only ever run on
 * the server. Tables and functions are in supabase/migrations/0001_core.sql.
 */
export class SupabaseStore implements ReportStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getReport(cacheKey: string): Promise<Report | null> {
    const { data, error } = await this.client
      .from("analyses")
      .select("report")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error) throw new Error(`Reading cached report failed: ${error.message}`);
    // A report written by an older schema version is treated as a miss.
    const parsed = ReportSchema.safeParse(data?.report);
    return parsed.success ? parsed.data : null;
  }

  async saveReport(listing: Listing, report: Report): Promise<void> {
    const { error } = await this.client.from("analyses").upsert({
      cache_key: report.cacheKey,
      portal: listing.portal,
      listing_id: listing.listingId,
      listing_url: listing.url,
      listing,
      report,
    });
    if (error) throw new Error(`Saving report failed: ${error.message}`);
  }

  async consumeQuota(installId: string, dailyLimit: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_analysis_quota", {
      p_install_id: installId,
      p_limit: dailyLimit,
    });
    if (error) throw new Error(`Rate limit check failed: ${error.message}`);
    return data === true;
  }

  async refundQuota(installId: string): Promise<void> {
    const { error } = await this.client.rpc("refund_analysis_quota", {
      p_install_id: installId,
    });
    if (error) console.error(`[store] quota refund failed: ${error.message}`);
  }
}
