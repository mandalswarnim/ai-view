import { ListingSchema, isPortalImageUrl } from "@aiview/shared";
import { describe, expect, it } from "vitest";
import { ListingExtractionError, findAdapter, rightmoveAdapter } from "../src";
import { unflatten } from "../src/util";
import { documentFrom, fixtureNames, loadFixture } from "./helpers";

describe("rightmoveAdapter.matches", () => {
  it.each([
    "https://www.rightmove.co.uk/properties/123456789",
    "https://www.rightmove.co.uk/properties/123456789#/?channel=RES_BUY",
    "https://www.rightmove.co.uk/properties/123456789/media?id=media0",
  ])("matches listing page %s", (url) => {
    expect(rightmoveAdapter.matches(url)).toBe(true);
    expect(findAdapter(url)).toBe(rightmoveAdapter);
  });

  it.each([
    "https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E787",
    "https://www.rightmove.co.uk/",
    "https://www.zoopla.co.uk/for-sale/details/12345678/",
    "https://rightmove.co.uk.example.com/properties/123456789",
    "not a url",
  ])("ignores %s", (url) => {
    expect(rightmoveAdapter.matches(url)).toBe(false);
  });
});

describe("rightmoveAdapter.extract (synthetic fixture)", () => {
  const listing = rightmoveAdapter.extract(loadFixture("rightmove", "synthetic-terrace.html"));

  it("reads identity, address and agent from PAGE_MODEL", () => {
    expect(listing.portal).toBe("rightmove");
    expect(listing.listingId).toBe("123456789");
    expect(listing.url).toBe("https://www.rightmove.co.uk/properties/123456789");
    expect(listing.address).toBe("Example Road, Leeds, LS6");
    expect(listing.agentName).toBe("Example Estates, Leeds");
  });

  it("converts the description to plain text", () => {
    expect(listing.description).toBe(
      "A bright three bedroom terrace close to the park.\n\n" +
        "The kitchen was refitted in 2022 & opens onto the garden. " +
        "Some images have been virtually staged for illustrative purposes.",
    );
  });

  it("keeps non-empty key features, including ones containing braces", () => {
    expect(listing.keyFeatures).toEqual([
      "Three bedrooms",
      "South-facing garden",
      "No onward chain {freehold}",
    ]);
  });

  it("takes the full-size photo URLs in order, without duplicates", () => {
    expect(listing.photos).toEqual([
      {
        url: "https://media.rightmove.co.uk/12k/11001/123456789/11001_EX1_IMG_00_0000.jpeg",
        caption: "Living Room",
      },
      {
        url: "https://media.rightmove.co.uk/12k/11001/123456789/11001_EX1_IMG_01_0000.jpeg",
        caption: 'Kitchen "as refitted"',
      },
      {
        url: "https://media.rightmove.co.uk/12k/11001/123456789/11001_EX1_IMG_02_0000.jpeg",
        caption: null,
      },
    ]);
  });

  it("reads floor plans separately from photos", () => {
    expect(listing.floorPlans).toEqual([
      {
        url: "https://media.rightmove.co.uk/12k/11001/123456789/11001_EX1_FLP_00_0000.jpeg",
        caption: "Floorplan",
      },
    ]);
  });
});

describe("rightmoveAdapter.extract (every saved fixture)", () => {
  it.each(fixtureNames("rightmove"))("%s yields a valid listing with photos", (name) => {
    const listing = rightmoveAdapter.extract(loadFixture("rightmove", name));
    expect(ListingSchema.safeParse(listing).success).toBe(true);
    expect(listing.listingId).toMatch(/^\d+$/);
    expect(listing.photos.length).toBeGreaterThan(0);
    for (const image of [...listing.photos, ...listing.floorPlans]) {
      expect(isPortalImageUrl("rightmove", image.url)).toBe(true);
    }
  });
});

describe("rightmoveAdapter.extract (real saved page, flattened __PAGE_MODEL)", () => {
  const name = fixtureNames("rightmove").find((file) => file.includes("Burney Street"));

  it.skipIf(name === undefined)("reads the Burney Street listing", () => {
    const listing = rightmoveAdapter.extract(loadFixture("rightmove", name!));
    expect(listing).toMatchObject({
      listingId: "92583567",
      url: "https://www.rightmove.co.uk/properties/92583567",
      address: "Burney Street, Greenwich, London, SE10",
      agentName: "Winkworth, Greenwich",
    });
    expect(listing.photos).toHaveLength(34);
    expect(listing.photos[0]).toEqual({
      url: "https://media.rightmove.co.uk/property-photo/6130e6729/92583567/6130e67290597619dbb77fd1819760b3.jpeg",
      caption: "Picture No. 20",
    });
    expect(listing.floorPlans).toHaveLength(1);
    expect(listing.keyFeatures).toContain("south-facing landscaped garden");
    expect(listing.description).toContain("Grade II listed Georgian house");
    expect(listing.description).not.toMatch(/<[a-z]/i);
  });

  it("reads a flattened page model", () => {
    const table = [
      { propertyData: 1 },
      { id: 2, address: 3, text: 5, keyFeatures: 7, images: 9, floorplans: 13, customer: 14 },
      555,
      { displayAddress: 4 },
      "Flat Street, York",
      { description: 6 },
      "A <b>flat</b>.",
      [8],
      "Balcony",
      [10],
      { url: 11, caption: 12 },
      "https://media.rightmove.co.uk/property-photo/a/555/a.jpeg",
      null,
      [],
      { branchDisplayName: 12, companyName: 15 },
      "Flat Agents Ltd",
    ];
    const model = JSON.stringify({ data: JSON.stringify(table) });
    const document = documentFrom(`<html><body><script>window.__PAGE_MODEL = ${model};</script></body></html>`);
    expect(rightmoveAdapter.extract(document)).toEqual({
      portal: "rightmove",
      listingId: "555",
      url: "https://www.rightmove.co.uk/properties/555",
      address: "Flat Street, York",
      agentName: "Flat Agents Ltd",
      description: "A flat.",
      keyFeatures: ["Balcony"],
      photos: [{ url: "https://media.rightmove.co.uk/property-photo/a/555/a.jpeg", caption: null }],
      floorPlans: [],
    });
  });
});

describe("unflatten", () => {
  it("rebuilds nested values from index references", () => {
    expect(unflatten([{ a: 1, b: 2 }, "x", [3, 1], 7])).toEqual({ a: "x", b: [7, "x"] });
  });

  it("reads negative and out-of-range indexes as null", () => {
    expect(unflatten([{ a: -1, b: 99 }])).toEqual({ a: null, b: null });
  });

  it("survives a value that refers to itself", () => {
    const value = unflatten([{ self: 0, n: 1 }, 5]) as { self: unknown; n: number };
    expect(value.n).toBe(5);
    expect(value.self).toBe(value);
  });

  it("returns undefined for anything that is not a table", () => {
    expect(unflatten("nope")).toBeUndefined();
    expect(unflatten([])).toBeUndefined();
  });
});

describe("rightmoveAdapter.extract (unreadable pages)", () => {
  it("throws a clear error when PAGE_MODEL is missing", () => {
    const document = documentFrom("<html><body><h1>Property</h1></body></html>");
    expect(() => rightmoveAdapter.extract(document)).toThrow(ListingExtractionError);
  });

  it("throws when PAGE_MODEL is not valid JSON", () => {
    const document = documentFrom(
      "<html><body><script>window.PAGE_MODEL = {propertyData: oops};</script></body></html>",
    );
    expect(() => rightmoveAdapter.extract(document)).toThrow(/PAGE_MODEL/);
  });
});
