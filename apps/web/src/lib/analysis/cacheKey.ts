import { createHash } from "node:crypto";
import type { Listing } from "@aiview/shared";

/**
 * portal + listing ID + a hash of the sorted photo URLs. Photo order and
 * duplicates do not matter; a listing whose photos change gets a new key and
 * so a fresh analysis.
 */
export function cacheKeyFor(listing: Pick<Listing, "portal" | "listingId" | "photos">): string {
  const urls = [...new Set(listing.photos.map((photo) => photo.url))].sort();
  const hash = createHash("sha256").update(urls.join("\n")).digest("hex").slice(0, 32);
  return `${listing.portal}:${listing.listingId}:${hash}`;
}
