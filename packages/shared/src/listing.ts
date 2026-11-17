import { z } from "zod";
import { PortalSchema } from "./portals";

/** Hard cap on photos sent to the vision model for one listing. */
export const MAX_PHOTOS_PER_LISTING = 20;
/** Floor plans sent to the model for one listing. */
export const MAX_FLOOR_PLANS_PER_LISTING = 2;

export const ListingImageSchema = z.object({
  /** Highest-resolution URL the portal exposes for this image. */
  url: z.url().max(2000),
  /** Caption shown by the portal, if any. Searched by the disclosure check. */
  caption: z.string().max(500).nullable(),
});
export type ListingImage = z.infer<typeof ListingImageSchema>;

/** What an adapter extracts from one listing page. */
export const ListingSchema = z.object({
  portal: PortalSchema,
  /** The portal's own ID for the listing. */
  listingId: z.string().min(1).max(64),
  url: z.url().max(2000),
  address: z.string().max(500),
  agentName: z.string().max(300).nullable(),
  /** Plain text, markup removed. */
  description: z.string().max(30_000),
  keyFeatures: z.array(z.string().max(500)).max(100),
  photos: z.array(ListingImageSchema).max(200),
  floorPlans: z.array(ListingImageSchema).max(20),
});
export type Listing = z.infer<typeof ListingSchema>;
