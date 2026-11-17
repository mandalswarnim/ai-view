/**
 * Runs the analysis over a folder of test listings and prints a results
 * table, so accuracy can be measured as the prompt and model change.
 *
 *   pnpm accuracy <folder> [--mock] [--out results.json] [--only name]
 *
 * Each test listing is one of:
 *   name.json   a Listing object. Photo URLs may be relative paths to image
 *               files in the folder, so edited/unedited test photos can be
 *               used without a live listing.
 *   name.html   a saved listing page, read with the portal adapters.
 *
 * Optional name.expected.json holds what a person judged to be true:
 *   { "status": "enhanced_not_disclosed", "disclosure": "not_disclosed",
 *     "categories": ["staging"] }
 *
 * This calls the analysis directly: no cache, no rate limit. Every listing
 * costs one real model call unless --mock is given.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { adapters } from "@aiview/adapters";
import {
  FindingCategorySchema,
  ListingSchema,
  OverallStatusSchema,
  STATUS_LABELS,
  type FindingCategory,
  type Listing,
  type Report,
} from "@aiview/shared";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { fetchOrReadImage } from "../src/lib/analysis/images";
import { analyseListing } from "../src/lib/analysis/pipeline";
import { countsTowardStatus } from "../src/lib/analysis/status";
import { analysisDeps } from "../src/lib/config";

const ExpectedSchema = z.object({
  status: OverallStatusSchema.optional(),
  disclosure: z.enum(["disclosed", "not_disclosed"]).optional(),
  /** Categories a correct report should contain at medium confidence or above. */
  categories: z.array(FindingCategorySchema).optional(),
});
type Expected = z.infer<typeof ExpectedSchema>;

interface Row {
  name: string;
  photos: string;
  disclosure: string;
  status: string;
  categories: string;
  expected: string;
  result: "pass" | "FAIL" | "error" | "-";
  seconds: string;
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(appDir, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

/** Relative image paths in a test listing become file: URLs. */
function resolveLocalImages(raw: unknown, folder: string): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const listing = raw as Record<string, unknown>;
  const fix = (images: unknown) =>
    Array.isArray(images)
      ? images.map((image: { url?: unknown }) =>
          typeof image?.url === "string" && !/^[a-z]+:/i.test(image.url)
            ? { ...image, url: pathToFileURL(isAbsolute(image.url) ? image.url : join(folder, image.url)).href }
            : image,
        )
      : images;
  return { ...listing, photos: fix(listing.photos), floorPlans: fix(listing.floorPlans) };
}

function loadListing(path: string): Listing {
  const source = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    return ListingSchema.parse(resolveLocalImages(JSON.parse(source), dirname(path)));
  }
  const document = parseHTML(source).document as unknown as Document;
  const errors: string[] = [];
  for (const adapter of adapters) {
    try {
      return adapter.extract(document);
    } catch (error) {
      errors.push(`${adapter.portal}: ${(error as Error).message}`);
    }
  }
  throw new Error(`No adapter could read this page (${errors.join("; ")})`);
}

function countedCategories(report: Report): FindingCategory[] {
  const categories = report.photos
    .flatMap((photo) => photo.findings)
    .filter((finding) => countsTowardStatus(finding.confidence))
    .map((finding) => finding.category);
  return [...new Set(categories)].sort();
}

function judge(report: Report, expected: Expected | null): Row["result"] {
  if (expected === null) return "-";
  const found = countedCategories(report);
  const ok =
    (expected.status === undefined || expected.status === report.status) &&
    (expected.disclosure === undefined || expected.disclosure === report.disclosure.status) &&
    (expected.categories === undefined ||
      expected.categories.every((category) => found.includes(category)));
  return ok ? "pass" : "FAIL";
}

function describeExpected(expected: Expected | null): string {
  if (expected === null) return "-";
  return [
    expected.status && STATUS_LABELS[expected.status],
    expected.disclosure,
    expected.categories?.join("+"),
  ]
    .filter(Boolean)
    .join(" / ");
}

function printTable(rows: Row[]): void {
  const columns: [keyof Row, string][] = [
    ["name", "Listing"],
    ["photos", "Photos"],
    ["disclosure", "Disclosure"],
    ["status", "Status"],
    ["categories", "Findings"],
    ["expected", "Expected"],
    ["result", "Result"],
    ["seconds", "Secs"],
  ];
  const widths = columns.map(([key, title]) =>
    Math.max(title.length, ...rows.map((row) => row[key].length)),
  );
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");
  console.log(line(columns.map(([, title]) => title)));
  console.log(line(widths.map((width) => "-".repeat(width))));
  for (const row of rows) console.log(line(columns.map(([key]) => row[key])));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      mock: { type: "boolean", default: false },
      out: { type: "string" },
      only: { type: "string" },
    },
  });
  // pnpm runs this from apps/web; paths are given relative to where pnpm was invoked.
  const invokedFrom = process.env.INIT_CWD ?? process.cwd();
  const folder = resolve(invokedFrom, positionals[0] ?? "fixtures/accuracy");
  if (!existsSync(folder)) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }

  loadEnv();
  const deps = { ...analysisDeps({ mock: values.mock }), loadImage: fetchOrReadImage };

  const files = readdirSync(folder)
    .filter((file) => /\.(json|html)$/.test(file) && !file.endsWith(".expected.json"))
    .filter((file) => !values.only || file.startsWith(values.only))
    .sort();
  if (files.length === 0) {
    console.error(`No .json or .html test listings in ${folder}`);
    process.exit(1);
  }

  console.log(`Analysing ${files.length} listing(s) from ${folder} with ${deps.model}\n`);

  const rows: Row[] = [];
  const reports: Record<string, Report | { error: string }> = {};

  for (const file of files) {
    const name = basename(file).replace(/\.(json|html)$/, "");
    const expectedPath = join(folder, `${name}.expected.json`);
    const started = Date.now();
    try {
      const expected = existsSync(expectedPath)
        ? ExpectedSchema.parse(JSON.parse(readFileSync(expectedPath, "utf8")))
        : null;
      const report = await analyseListing(loadListing(join(folder, file)), deps);
      reports[name] = report;
      rows.push({
        name,
        photos: `${report.photosAnalysed}/${report.photosTotal}`,
        disclosure: report.disclosure.status,
        status: STATUS_LABELS[report.status],
        categories: countedCategories(report).join("+") || "none",
        expected: describeExpected(expected),
        result: judge(report, expected),
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      });
    } catch (error) {
      const message = (error as Error).message;
      reports[name] = { error: message };
      rows.push({
        name,
        photos: "-",
        disclosure: "-",
        status: `error: ${message.slice(0, 60)}`,
        categories: "-",
        expected: "-",
        result: "error",
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      });
    }
    process.stderr.write(`  ${name}: ${rows.at(-1)!.result}\n`);
  }

  console.log();
  printTable(rows);

  const judged = rows.filter((row) => row.result === "pass" || row.result === "FAIL");
  const passed = judged.filter((row) => row.result === "pass").length;
  const errors = rows.filter((row) => row.result === "error").length;
  console.log();
  console.log(
    judged.length > 0
      ? `Accuracy: ${passed}/${judged.length} (${Math.round((passed / judged.length) * 100)}%) of listings with an expected result.`
      : "No listings had a .expected.json file, so accuracy was not scored.",
  );
  if (errors > 0) console.log(`${errors} listing(s) could not be analysed.`);

  if (values.out) {
    const outPath = resolve(invokedFrom, values.out);
    writeFileSync(outPath, JSON.stringify(reports, null, 2));
    console.log(`Full reports written to ${outPath}`);
  }
  if (errors > 0 || passed < judged.length) process.exitCode = 1;
}

await main();
