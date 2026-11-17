import type { Listing, Portal } from "@aiview/shared";

/**
 * One per portal. Adapters only read the document they are given: they never
 * fetch anything, so the same code runs in the extension's content script and
 * on the server against HTML fetched at a user's request.
 */
export interface SiteAdapter {
  portal: Portal;
  /** True when the URL is a single-listing page on this portal. */
  matches(url: string): boolean;
  /** Throws ListingExtractionError when the page cannot be read. */
  extract(document: Document): Listing;
}

/** The page did not contain what the adapter expected. */
export class ListingExtractionError extends Error {
  constructor(
    public readonly portal: Portal,
    message: string,
  ) {
    super(message);
    this.name = "ListingExtractionError";
  }
}
