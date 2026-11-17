import { DISCLAIMER, ReportSchema } from "@aiview/shared";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { downscale } from "@/lib/analysis/images";
import type { ModelOutput, VisionAnalyser, VisionInput } from "@/lib/analysis/modelOutput";
import { NoPhotosError, analyseListing, type AnalysisDeps } from "@/lib/analysis/pipeline";
import { buildUserContent } from "@/lib/analysis/prompt";
import { fakeLoader, makeListing, tinyImage } from "./helpers";

/** A stand-in for the vision model. No test in this repo calls the real API. */
function stubVision(output: ModelOutput) {
  return vi.fn<VisionAnalyser>(async () => output);
}

function deps(vision: VisionAnalyser, overrides: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    vision,
    loadImage: fakeLoader(),
    model: "test-model",
    maxPhotos: 20,
    siteUrl: "https://aiview.example",
    now: () => new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
  };
}

const EMPTY: ModelOutput = { photos: [], crossChecks: [] };

describe("analyseListing", () => {
  it("builds a complete, schema-valid report", async () => {
    const vision = stubVision({
      photos: [
        {
          photo: 2,
          findings: [
            {
              category: "staging",
              evidence: "The dining table has no contact shadow on the floor.",
              confidence: "high",
            },
          ],
        },
      ],
      crossChecks: [],
    });

    const report = await analyseListing(makeListing(), deps(vision));

    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({
      portal: "rightmove",
      listingId: "123456789",
      status: "enhanced_not_disclosed",
      disclosure: { status: "not_disclosed" },
      photosTotal: 3,
      photosAnalysed: 3,
      floorPlansAnalysed: 1,
      model: "test-model",
      analysedAt: "2026-01-02T03:04:05.000Z",
      disclaimer: DISCLAIMER,
      viewerPhotos: [],
    });
    expect(report.reportErrorUrl).toBe(
      `https://aiview.example/report-error?ref=${encodeURIComponent(report.cacheKey)}`,
    );
    // Every analysed photo is listed, with findings attached to the right one.
    expect(report.photos.map((photo) => photo.findings.length)).toEqual([0, 1, 0]);
    expect(report.photos[1]).toMatchObject({ index: 1, caption: "Kitchen" });
  });

  it("reports 'enhanced and disclosed' when the listing text discloses staging", async () => {
    const listing = makeListing({ description: "Some rooms have been virtually staged." });
    const vision = stubVision({
      photos: [
        { photo: 1, findings: [{ category: "staging", evidence: "A sofa floats.", confidence: "medium" }] },
      ],
      crossChecks: [],
    });
    const report = await analyseListing(listing, deps(vision));
    expect(report.status).toBe("enhanced_disclosed");
    expect(report.disclosure.matches[0]?.term).toBe("virtually staged");
  });

  it("derives the status in code from findings and cross-checks", async () => {
    const vision = stubVision({
      photos: [],
      crossChecks: [
        {
          type: "floorplan_openings",
          evidence: "The bedroom photo shows two windows where the floor plan shows one.",
          confidence: "medium",
          photos: [3, 3, 99],
        },
      ],
    });
    const report = await analyseListing(makeListing(), deps(vision));
    expect(report.status).toBe("possible_structural_or_concealment");
    // Photo numbers become zero-based indexes; unknown photos are dropped.
    expect(report.crossChecks[0]?.photoIndexes).toEqual([2]);
  });

  it("replaces accusatory model wording before it reaches the report", async () => {
    const vision = stubVision({
      photos: [
        {
          photo: 1,
          findings: [
            { category: "concealment", evidence: "Example Estates faked this wall.", confidence: "high" },
          ],
        },
      ],
      crossChecks: [],
    });
    const report = await analyseListing(makeListing(), deps(vision));
    const text = JSON.stringify(report.photos);
    expect(text).not.toMatch(/fake|Example Estates/i);
    expect(report.photos[0]?.findings[0]?.evidence).toContain("signs consistent with");
  });

  it("ignores findings for photos the model was never shown", async () => {
    const vision = stubVision({
      photos: [
        { photo: 0, findings: [{ category: "structural", evidence: "A wall.", confidence: "high" }] },
        { photo: 7, findings: [{ category: "structural", evidence: "A wall.", confidence: "high" }] },
      ],
      crossChecks: [],
    });
    const report = await analyseListing(makeListing(), deps(vision));
    expect(report.status).toBe("no_concerns");
    expect(report.photos.flatMap((photo) => photo.findings)).toEqual([]);
  });

  it("sends at most maxPhotos photos, and never more than 20", async () => {
    const photos = Array.from({ length: 30 }, (_, i) => ({
      url: `https://media.rightmove.co.uk/a/IMG_${i}.jpeg`,
      caption: null,
    }));
    const listing = makeListing({ photos });

    const capped = stubVision(EMPTY);
    const report = await analyseListing(listing, deps(capped, { maxPhotos: 5 }));
    expect(capped.mock.calls[0]![0].photos).toHaveLength(5);
    expect(report).toMatchObject({ photosTotal: 30, photosAnalysed: 5 });

    const uncapped = stubVision(EMPTY);
    await analyseListing(listing, deps(uncapped, { maxPhotos: 500 }));
    expect(uncapped.mock.calls[0]![0].photos).toHaveLength(20);
  });

  it("skips photos that fail to load and keeps the others' numbering", async () => {
    const listing = makeListing();
    const vision = stubVision({
      photos: [
        { photo: 3, findings: [{ category: "cosmetic", evidence: "The sky is flat blue.", confidence: "medium" }] },
      ],
      crossChecks: [],
    });
    const loadImage = fakeLoader([listing.photos[1]!.url]);

    const report = await analyseListing(listing, deps(vision, { loadImage }));

    const input: VisionInput = vision.mock.calls[0]![0];
    expect(input.photos.map((photo) => photo.index)).toEqual([0, 2]);
    expect(report.photosAnalysed).toBe(2);
    expect(report.photos.map((photo) => photo.index)).toEqual([0, 2]);
    expect(report.photos[1]?.findings).toHaveLength(1);
  });

  it("fails without calling the model when no photo can be loaded", async () => {
    const listing = makeListing();
    const vision = stubVision(EMPTY);
    const loadImage = fakeLoader(listing.photos.map((photo) => photo.url));
    await expect(analyseListing(listing, deps(vision, { loadImage }))).rejects.toBeInstanceOf(
      NoPhotosError,
    );
    expect(vision).not.toHaveBeenCalled();
  });
});

describe("image preparation", () => {
  it("downscales large images to the longest-edge limit as JPEG", async () => {
    const base64 = await downscale(await tinyImage(3000, 2000), 1024);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1024, height: 683 });
  });

  it("does not enlarge small images", async () => {
    const base64 = await downscale(await tinyImage(40, 30), 1024);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    expect(meta).toMatchObject({ width: 40, height: 30 });
  });
});

describe("buildUserContent", () => {
  it("labels each photo by its listing position and leaves the agent out", () => {
    const listing = makeListing();
    const image = { mediaType: "image/jpeg" as const, base64: "AAAA" };
    const content = buildUserContent({
      listing,
      photos: [
        { index: 0, caption: "Living Room", ...image },
        { index: 2, caption: null, ...image },
      ],
      floorPlans: [],
    });

    const text = content.flatMap((block) => (block.type === "text" ? [block.text] : []));
    expect(text).toContain('Photo 1 (caption: "Living Room"):');
    expect(text).toContain("Photo 3:");
    expect(text).toContain("No floor plan image is available for this listing.");
    expect(text.join("\n")).not.toContain("Example Estates");
    expect(content.filter((block) => block.type === "image")).toHaveLength(2);
  });
});
