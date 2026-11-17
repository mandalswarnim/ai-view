import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ReportSchema, type Listing, type Report } from "@aiview/shared";
import { utcDay, type ReportStore } from "./types";

interface Data {
  reports: Record<string, { listing: Listing; report: Report }>;
  /** "installId|YYYY-MM-DD" -> analyses started that day. */
  usage: Record<string, number>;
}

/**
 * Development store: one JSON file on local disk, or memory only when no
 * path is given (tests). Not for production; Vercel has no durable disk.
 */
export class LocalStore implements ReportStore {
  private data: Data | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Runs one read-modify-write at a time so concurrent requests cannot interleave. */
  private exclusive<T>(task: (data: Data) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => task(await this.load()));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<Data> {
    if (this.data !== null) return this.data;
    let data: Data = { reports: {}, usage: {} };
    if (this.filePath !== null) {
      try {
        data = { ...data, ...(JSON.parse(await readFile(this.filePath, "utf8")) as Partial<Data>) };
      } catch {
        // First run, or an unreadable file: start empty.
      }
    }
    this.data = data;
    return data;
  }

  private async persist(data: Data): Promise<void> {
    if (this.filePath === null) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  getReport(cacheKey: string): Promise<Report | null> {
    return this.exclusive((data) => {
      const parsed = ReportSchema.safeParse(data.reports[cacheKey]?.report);
      return parsed.success ? parsed.data : null;
    });
  }

  saveReport(listing: Listing, report: Report): Promise<void> {
    return this.exclusive(async (data) => {
      data.reports[report.cacheKey] = { listing, report };
      await this.persist(data);
    });
  }

  consumeQuota(installId: string, dailyLimit: number): Promise<boolean> {
    return this.exclusive(async (data) => {
      const key = `${installId}|${utcDay(this.now())}`;
      const used = data.usage[key] ?? 0;
      if (used >= dailyLimit) return false;
      data.usage[key] = used + 1;
      await this.persist(data);
      return true;
    });
  }

  refundQuota(installId: string): Promise<void> {
    return this.exclusive(async (data) => {
      const key = `${installId}|${utcDay(this.now())}`;
      const used = data.usage[key] ?? 0;
      if (used > 0) data.usage[key] = used - 1;
      await this.persist(data);
    });
  }
}
