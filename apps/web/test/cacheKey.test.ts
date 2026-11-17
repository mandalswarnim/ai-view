import { describe, expect, it } from "vitest";
import { cacheKeyFor } from "@/lib/analysis/cacheKey";
import { makeListing } from "./helpers";

describe("cacheKeyFor", () => {
  const listing = makeListing();

  it("is portal, listing ID and a hash", () => {
    expect(cacheKeyFor(listing)).toMatch(/^rightmove:123456789:[0-9a-f]{32}$/);
  });

  it("ignores photo order", () => {
    const reversed = makeListing({ photos: [...listing.photos].reverse() });
    expect(cacheKeyFor(reversed)).toBe(cacheKeyFor(listing));
  });

  it("ignores duplicate photos and captions", () => {
    const noisy = makeListing({
      photos: [...listing.photos, { url: listing.photos[0]!.url, caption: "Different caption" }],
    });
    expect(cacheKeyFor(noisy)).toBe(cacheKeyFor(listing));
  });

  it("ignores listing text", () => {
    const edited = makeListing({
      description: "Price reduced!",
      keyFeatures: [],
      address: "Elsewhere",
      agentName: null,
    });
    expect(cacheKeyFor(edited)).toBe(cacheKeyFor(listing));
  });

  it("changes when the floor plan changes, since the model is shown it", () => {
    const none = makeListing({ floorPlans: [] });
    const other = makeListing({
      floorPlans: [{ url: "https://media.rightmove.co.uk/b/OTHER_FLP.jpeg", caption: null }],
    });
    expect(new Set([cacheKeyFor(listing), cacheKeyFor(none), cacheKeyFor(other)]).size).toBe(3);
  });

  it("does not confuse a photo with a floor plan", () => {
    const image = { url: "https://media.rightmove.co.uk/a/X.jpeg", caption: null };
    const asPhoto = makeListing({ photos: [image], floorPlans: [] });
    const asPlan = makeListing({ photos: [], floorPlans: [image] });
    expect(cacheKeyFor(asPhoto)).not.toBe(cacheKeyFor(asPlan));
  });

  it("changes when a photo is added, removed or replaced", () => {
    const added = makeListing({
      photos: [...listing.photos, { url: "https://media.rightmove.co.uk/a/IMG_03.jpeg", caption: null }],
    });
    const removed = makeListing({ photos: listing.photos.slice(1) });
    const keys = new Set([cacheKeyFor(listing), cacheKeyFor(added), cacheKeyFor(removed)]);
    expect(keys.size).toBe(3);
  });

  it("changes with the portal and the listing ID", () => {
    expect(cacheKeyFor(makeListing({ listingId: "987" }))).not.toBe(cacheKeyFor(listing));
    expect(cacheKeyFor(makeListing({ portal: "zoopla" }))).not.toBe(cacheKeyFor(listing));
  });

  it("does not confuse URLs that only differ by where they are split", () => {
    const a = makeListing({
      photos: [
        { url: "https://media.rightmove.co.uk/a", caption: null },
        { url: "https://media.rightmove.co.uk/b", caption: null },
      ],
    });
    const b = makeListing({
      photos: [{ url: "https://media.rightmove.co.uk/ahttps://media.rightmove.co.uk/b", caption: null }],
    });
    expect(cacheKeyFor(a)).not.toBe(cacheKeyFor(b));
  });
});
