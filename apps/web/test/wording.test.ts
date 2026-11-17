import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/analysis/prompt";
import { isSafeWording, safeCrossCheckEvidence, safeFindingEvidence } from "@/lib/analysis/wording";

const AGENT = "Example Estates, Leeds";

describe("evidence wording", () => {
  it("keeps measured, descriptive sentences", () => {
    const evidence = "The rug under the sofa has no shadow and may have been added digitally.";
    expect(safeFindingEvidence(evidence, "staging", AGENT)).toBe(evidence);
  });

  it.each([
    "This window is fake.",
    "The photo is fraudulent.",
    "This edit is illegal under consumer law.",
    "The image is a scam.",
    "The agent is deceiving buyers.",
    "A misleading edit hides the damp.",
  ])("replaces accusatory wording: %s", (evidence) => {
    const safe = safeFindingEvidence(evidence, "structural", AGENT);
    expect(safe).not.toBe(evidence);
    expect(safe).toContain("signs consistent with");
    expect(isSafeWording(safe, AGENT)).toBe(true);
  });

  it("replaces evidence that names the agent", () => {
    expect(isSafeWording("Example Estates appear to have removed a stain.", AGENT)).toBe(false);
    expect(isSafeWording("EXAMPLE ESTATES, LEEDS edited this.", AGENT)).toBe(false);
    expect(safeFindingEvidence("Example Estates removed a stain.", "concealment", AGENT)).toBe(
      "An area of this photo shows signs consistent with digital retouching.",
    );
  });

  it("replaces empty evidence", () => {
    expect(safeFindingEvidence("   ", "cosmetic", null)).toContain("signs consistent with");
  });

  it("applies the same rules to cross-checks", () => {
    expect(safeCrossCheckEvidence("The floor plan is fake.", "floorplan_openings", AGENT)).toBe(
      "The windows or doors visible in the photos may differ from the floor plan.",
    );
  });

  it("collapses whitespace and limits length", () => {
    const long = `The wall  looks\nsmooth. ${"x".repeat(600)}`;
    const safe = safeFindingEvidence(long, "concealment", null);
    expect(safe.startsWith("The wall looks smooth.")).toBe(true);
    expect(safe.length).toBe(400);
  });
});

describe("system prompt", () => {
  it("tells the model how to phrase evidence", () => {
    expect(SYSTEM_PROMPT).toContain("signs consistent with");
    expect(SYSTEM_PROMPT).toContain("do not mention the estate agent");
  });
});
