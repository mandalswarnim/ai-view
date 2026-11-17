import {
  ConfidenceSchema,
  CrossCheckTypeSchema,
  FindingCategorySchema,
  type Listing,
} from "@aiview/shared";
import { z } from "zod";

/** The JSON the vision model is asked to return. Photo numbers start at 1. */
export const ModelOutputSchema = z.object({
  photos: z.array(
    z.object({
      photo: z.number().int(),
      findings: z.array(
        z.object({
          category: FindingCategorySchema,
          evidence: z.string(),
          confidence: ConfidenceSchema,
        }),
      ),
    }),
  ),
  crossChecks: z.array(
    z.object({
      type: CrossCheckTypeSchema,
      evidence: z.string(),
      confidence: ConfidenceSchema,
      photos: z.array(z.number().int()),
    }),
  ),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** An image downscaled and ready to send. */
export interface PreparedImage {
  /** Position in the listing's photos (or floor plans), starting at 0. */
  index: number;
  caption: string | null;
  mediaType: "image/jpeg";
  base64: string;
}

export interface VisionInput {
  listing: Listing;
  photos: PreparedImage[];
  floorPlans: PreparedImage[];
}

/** The only place the model is called. Tests replace it with a stub. */
export type VisionAnalyser = (input: VisionInput) => Promise<ModelOutput>;
