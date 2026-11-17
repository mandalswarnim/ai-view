import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ModelOutputSchema, type ModelOutput, type VisionAnalyser } from "./modelOutput";
import { SYSTEM_PROMPT, buildUserContent } from "./prompt";

export class VisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionError";
  }
}

/**
 * Calls the Anthropic Messages API once per listing, with structured outputs
 * so the reply is guaranteed to match ModelOutputSchema.
 */
export function createAnthropicVision(model: string): VisionAnalyser {
  // Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the environment.
  const client = new Anthropic();

  return async (input): Promise<ModelOutput> => {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserContent(input) }],
      output_config: { format: zodOutputFormat(ModelOutputSchema) },
    });

    if (response.stop_reason === "refusal") {
      throw new VisionError("The model declined to analyse this listing.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new VisionError("The model's reply was cut off before it finished.");
    }
    if (response.parsed_output === null) {
      throw new VisionError("The model's reply did not match the expected format.");
    }
    return response.parsed_output;
  };
}

/**
 * Stand-in used when AIVIEW_MOCK_VISION=1 and by `accuracy --mock`. It never
 * looks at the images, so its output is clearly labelled as a placeholder.
 */
export const mockVision: VisionAnalyser = async ({ photos }) => ({
  photos: photos.map((photo, position) => ({
    photo: photo.index + 1,
    findings:
      position === 0
        ? [
            {
              category: "staging" as const,
              evidence: "Placeholder finding from mock mode; no real analysis was run.",
              confidence: "medium" as const,
            },
          ]
        : [],
  })),
  crossChecks: [],
});
