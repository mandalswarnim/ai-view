import { describe, expect, it } from "vitest";
import { checkDisclosure } from "@/lib/analysis/disclosure";
import { makeListing } from "./helpers";

function describedAs(description: string) {
  return checkDisclosure(makeListing({ description, keyFeatures: [], photos: [], floorPlans: [] }));
}

describe("checkDisclosure", () => {
  it.each([
    "Some images are AI enhanced.",
    "Photos generated using A.I.",
    "Images created with artificial intelligence.",
    "The lounge has been virtually staged.",
    "Virtual staging has been used in some photographs.",
    "Bedroom two is virtually furnished to show its potential.",
    "CGI images of the proposed extension.",
    "CGIs are indicative only.",
    "Computer generated images are shown.",
    "Photographs have been digitally enhanced.",
    "The garden image is digitally altered.",
    "Furniture is shown for illustrative purposes only.",
    "Images are for illustration purposes.",
    "Includes an artist's impression of the finished development.",
    "Please note some photos have been enhanced.",
    "Enhanced images are used in this listing.",
    "SOME IMAGES HAVE BEEN VIRTUALLY STAGED.",
  ])("finds a disclosure in: %s", (description) => {
    const result = describedAs(description);
    expect(result.status).toBe("disclosed");
    expect(result.matches[0]?.source).toBe("description");
  });

  it.each([
    "A bright three bedroom terrace close to the park.",
    "Benefits from air conditioning and a fair-sized garden.",
    "Maintained to a high standard, with stairs to the first floor.",
    "Said to be available immediately. Email the agent for details.",
    "The kitchen has enhanced storage and a virtual doorman intercom.",
    "Digital TV aerial point. Staged payment available on the deposit.",
    "Close to the Thai restaurant and the Kai Tak sports centre.",
    "Viewing is essential to appreciate the purpose-built garage.",
  ])("finds nothing in: %s", (description) => {
    expect(describedAs(description)).toEqual({ status: "not_disclosed", matches: [] });
  });

  it("searches key features", () => {
    const result = checkDisclosure(
      makeListing({ keyFeatures: ["Two bedrooms", "Some images virtually staged"] }),
    );
    expect(result.status).toBe("disclosed");
    expect(result.matches).toEqual([
      { term: "virtually staged", source: "key_features", excerpt: "Some images virtually staged" },
    ]);
  });

  it("searches photo and floor plan captions", () => {
    const result = checkDisclosure(
      makeListing({
        photos: [
          { url: "https://media.rightmove.co.uk/a/1.jpeg", caption: "Lounge (CGI)" },
          { url: "https://media.rightmove.co.uk/a/2.jpeg", caption: null },
        ],
      }),
    );
    expect(result.status).toBe("disclosed");
    expect(result.matches[0]).toMatchObject({ term: "CGI", source: "photo_caption" });
  });

  it("returns a trimmed excerpt around the match", () => {
    const padding = "The property is well presented throughout. ".repeat(5);
    const result = describedAs(`${padding}Some rooms are virtually staged. ${padding}`);
    const excerpt = result.matches[0]!.excerpt;
    expect(excerpt).toContain("virtually staged");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThan(160);
  });
});
