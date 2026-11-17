import type { CrossCheck, Disclosure, Finding } from "@aiview/shared";
import { describe, expect, it } from "vitest";
import { deriveStatus } from "@/lib/analysis/status";

const disclosed: Disclosure = {
  status: "disclosed",
  matches: [{ term: "virtually staged", source: "description", excerpt: "virtually staged" }],
};
const notDisclosed: Disclosure = { status: "not_disclosed", matches: [] };

function finding(category: Finding["category"], confidence: Finding["confidence"]): Finding {
  return { category, confidence, evidence: "Something is visible." };
}

function crossCheck(type: CrossCheck["type"], confidence: CrossCheck["confidence"]): CrossCheck {
  return { type, confidence, evidence: "Something differs.", photoIndexes: [0] };
}

describe("deriveStatus", () => {
  it("is 'no concerns' with no findings and no disclosure", () => {
    expect(deriveStatus([], [], notDisclosed)).toBe("no_concerns");
  });

  it("is 'enhanced and disclosed' when the listing discloses edits, even if none were seen", () => {
    expect(deriveStatus([], [], disclosed)).toBe("enhanced_disclosed");
  });

  it.each(["cosmetic", "staging"] as const)("treats a %s finding as enhancement", (category) => {
    const findings = [finding(category, "medium")];
    expect(deriveStatus(findings, [], disclosed)).toBe("enhanced_disclosed");
    expect(deriveStatus(findings, [], notDisclosed)).toBe("enhanced_not_disclosed");
  });

  it.each(["structural", "concealment"] as const)(
    "flags a %s finding whether or not edits were disclosed",
    (category) => {
      const findings = [finding("cosmetic", "high"), finding(category, "medium")];
      expect(deriveStatus(findings, [], disclosed)).toBe("possible_structural_or_concealment");
      expect(deriveStatus(findings, [], notDisclosed)).toBe("possible_structural_or_concealment");
    },
  );

  it("does not let low-confidence findings change the status", () => {
    const findings = [finding("structural", "low"), finding("staging", "low")];
    expect(deriveStatus(findings, [], notDisclosed)).toBe("no_concerns");
    expect(deriveStatus(findings, [], disclosed)).toBe("enhanced_disclosed");
  });

  it("keeps a low-confidence structural finding from outranking a counted cosmetic one", () => {
    const findings = [finding("structural", "low"), finding("cosmetic", "high")];
    expect(deriveStatus(findings, [], notDisclosed)).toBe("enhanced_not_disclosed");
  });

  it.each(["photo_inconsistency", "floorplan_openings", "floorplan_dimensions"] as const)(
    "flags a %s cross-check",
    (type) => {
      expect(deriveStatus([], [crossCheck(type, "medium")], notDisclosed)).toBe(
        "possible_structural_or_concealment",
      );
      expect(deriveStatus([], [crossCheck(type, "low")], notDisclosed)).toBe("no_concerns");
    },
  );

  it("never changes the status for wide-angle distortion", () => {
    expect(deriveStatus([], [crossCheck("wide_angle", "high")], notDisclosed)).toBe("no_concerns");
  });
});
