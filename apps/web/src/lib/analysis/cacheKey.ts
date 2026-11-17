import { createHash } from "node:crypto";
import type { Listing } from "@aiview/shared";

function sortedUnique(images: readonly { url: string }[]): string[] {
  return [...new Set(images.map((image) => image.url))].sort();
}

/**
 * portal + listing ID + a hash of the sorted photo and floor plan URLs.
 * Order, duplicates, captions and listing text do not matter; a listing
 * whose images change gets a new key and so a fresh analysis.
 *
 * Every image the model is shown is part of the key. That is what makes the
 * shared cache safe: a caller cannot attach findings to someone else's
 * listing by submitting it with a different floor plan.
 */
export function cacheKeyFor(
  listing: Pick<Listing, "portal" | "listingId" | "photos" | "floorPlans">,
): string {
  const parts = [...sortedUnique(listing.photos), "--floor-plans--", ...sortedUnique(listing.floorPlans)];
  const hash = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
  return `${listing.portal}:${listing.listingId}:${hash}`;
}
