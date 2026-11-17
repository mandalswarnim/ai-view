import { ListingSchema, type Listing, type ListingImage } from "@aiview/shared";
import { ListingExtractionError, type SiteAdapter } from "./types";
import { asArray, asRecord, asString, htmlToText, readJsonAfter, toHttpsUrl, unflatten } from "./util";

const LISTING_PATH = /^\/properties\/(\d+)/;

/**
 * Rightmove embeds the whole listing as JSON in an inline script. Everything
 * is read from its `propertyData`; no CSS selectors are involved. Two forms
 * exist:
 *
 *   window.__PAGE_MODEL = {"data": "[...]"}       current: a JSON string
 *                                                 holding a flattened table
 *   window.PAGE_MODEL = {"propertyData": {...}}   older: plain nested JSON
 */
function readPropertyData(document: Document): Record<string, unknown> {
  for (const script of Array.from(document.querySelectorAll("script"))) {
    const source = script.textContent ?? "";
    if (!source.includes("PAGE_MODEL")) continue;

    let model = asRecord(readJsonAfter(source, "PAGE_MODEL"));
    if (typeof model.data === "string") {
      try {
        model = asRecord(unflatten(JSON.parse(model.data)));
      } catch {
        continue;
      }
    }
    const propertyData = asRecord(model.propertyData);
    if (Object.keys(propertyData).length > 0) return propertyData;
  }
  throw new ListingExtractionError(
    "rightmove",
    "No PAGE_MODEL listing data found on the page. Rightmove may have changed how it embeds listing data.",
  );
}

function readImages(items: unknown): ListingImage[] {
  const seen = new Set<string>();
  const images: ListingImage[] = [];
  for (const item of asArray(items)) {
    const record = asRecord(item);
    // `url` is the original upload; `resizedImageUrls` only holds smaller copies.
    const url = toHttpsUrl(record.url);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    images.push({ url, caption: asString(record.caption) });
  }
  return images;
}

export const rightmoveAdapter: SiteAdapter = {
  portal: "rightmove",

  matches(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "www.rightmove.co.uk" && LISTING_PATH.test(parsed.pathname);
    } catch {
      return false;
    }
  },

  extract(document): Listing {
    const data = readPropertyData(document);

    const listingId = asString(data.id);
    if (listingId === null) {
      throw new ListingExtractionError("rightmove", "PAGE_MODEL.propertyData has no id.");
    }

    const customer = asRecord(data.customer);
    const text = asRecord(data.text);

    const listing = {
      portal: "rightmove" as const,
      listingId,
      // Rebuilt from the ID so search and tracking parameters never leave the page.
      url: `https://www.rightmove.co.uk/properties/${listingId}`,
      address: asString(asRecord(data.address).displayAddress) ?? "",
      agentName: asString(customer.branchDisplayName) ?? asString(customer.companyName),
      description: htmlToText(asString(text.description) ?? ""),
      keyFeatures: asArray(data.keyFeatures)
        .map((feature) => asString(feature))
        .filter((feature): feature is string => feature !== null),
      photos: readImages(data.images),
      floorPlans: readImages(data.floorplans),
    };

    const parsed = ListingSchema.safeParse(listing);
    if (!parsed.success) {
      throw new ListingExtractionError(
        "rightmove",
        `Extracted listing failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      );
    }
    return parsed.data;
  },
};
