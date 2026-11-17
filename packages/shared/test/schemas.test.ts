import { describe, expect, it } from "vitest";
import {
  ListingSchema,
  STATUS_LABELS,
  STATUS_SUMMARIES,
  isPortalImageUrl,
  isPortalPageUrl,
} from "../src";

const listing = {
  portal: "rightmove",
  listingId: "123456789",
  url: "https://www.rightmove.co.uk/properties/123456789",
  address: "Example Road, Leeds, LS1",
  agentName: "Example Estates, Leeds",
  description: "A two bedroom terrace.",
  keyFeatures: ["Two bedrooms"],
  photos: [
    { url: "https://media.rightmove.co.uk/1k/1_IMG_00_0000.jpeg", caption: null },
  ],
  floorPlans: [],
};

describe("ListingSchema", () => {
  it("accepts a well-formed listing", () => {
    expect(ListingSchema.parse(listing)).toEqual(listing);
  });

  it("rejects an unknown portal", () => {
    expect(ListingSchema.safeParse({ ...listing, portal: "gumtree" }).success).toBe(false);
  });

  it("rejects a photo without a valid URL", () => {
    const bad = { ...listing, photos: [{ url: "not a url", caption: null }] };
    expect(ListingSchema.safeParse(bad).success).toBe(false);
  });
});

describe("portal URL checks", () => {
  it("accepts the portal's own image hosts only", () => {
    expect(isPortalImageUrl("rightmove", "https://media.rightmove.co.uk/a.jpeg")).toBe(true);
    expect(isPortalImageUrl("rightmove", "https://evil.example/a.jpeg")).toBe(false);
    expect(isPortalImageUrl("rightmove", "https://notrightmove.co.uk/a.jpeg")).toBe(false);
    expect(isPortalImageUrl("rightmove", "http://media.rightmove.co.uk/a.jpeg")).toBe(false);
    expect(isPortalImageUrl("zoopla", "https://lid.zoocdn.com/u/1024/768/a.jpg")).toBe(true);
  });

  it("matches listing pages to their portal", () => {
    expect(isPortalPageUrl("rightmove", "https://www.rightmove.co.uk/properties/1")).toBe(true);
    expect(isPortalPageUrl("rightmove", "https://www.zoopla.co.uk/for-sale/details/1")).toBe(false);
  });
});

describe("user-facing wording", () => {
  it("never calls a listing fake, fraudulent or illegal", () => {
    const text = [...Object.values(STATUS_LABELS), ...Object.values(STATUS_SUMMARIES)].join(" ");
    expect(text).not.toMatch(/\b(fake|fraud\w*|illegal|unlawful|scam\w*)\b/i);
  });
});
