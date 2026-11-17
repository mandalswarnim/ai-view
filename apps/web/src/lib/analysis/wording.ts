import type { CrossCheckType, FindingCategory } from "@aiview/shared";

/**
 * The model is told how to phrase evidence, but its text is shown to the
 * public next to a named agent's listing, so it is checked again here. Any
 * sentence that asserts wrongdoing or names the agent is replaced with a
 * neutral one rather than published.
 */
const ACCUSATORY =
  /\b(fake[ds]?|fakery|faking|fraud\w*|illegal\w*|unlawful\w*|scam\w*|criminal\w*|deceiv\w*|decepti\w*|dishonest\w*|misrepresent\w*|misleading\w*|mislead\w*|conceal(?:ed|ing|s)? (?:by|to)|cover(?:ed|ing)?[- ]up)\b/i;

const FINDING_FALLBACK: Record<FindingCategory, string> = {
  cosmetic: "This photo shows signs consistent with adjusted lighting or colour.",
  staging: "This photo shows signs consistent with virtual staging or digital decluttering.",
  structural: "A structural feature in this photo shows signs consistent with digital editing.",
  concealment: "An area of this photo shows signs consistent with digital retouching.",
};

const CROSS_CHECK_FALLBACK: Record<CrossCheckType, string> = {
  photo_inconsistency: "Photos that appear to show the same room may differ from each other.",
  floorplan_openings: "The windows or doors visible in the photos may differ from the floor plan.",
  floorplan_dimensions: "A room may look a different size in the photos than on the floor plan.",
  wide_angle: "A wide-angle lens may make this room look larger than it is.",
};

function namesAgent(text: string, agentName: string | null): boolean {
  if (agentName === null) return false;
  const haystack = text.toLowerCase();
  // "Example Estates, Leeds" -> also catch "Example Estates" on its own.
  const names = [agentName, agentName.split(",")[0] ?? ""]
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length >= 4);
  return names.some((name) => haystack.includes(name));
}

export function isSafeWording(text: string, agentName: string | null): boolean {
  return text.trim() !== "" && !ACCUSATORY.test(text) && !namesAgent(text, agentName);
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

export function safeFindingEvidence(
  evidence: string,
  category: FindingCategory,
  agentName: string | null,
): string {
  return isSafeWording(evidence, agentName) ? tidy(evidence) : FINDING_FALLBACK[category];
}

export function safeCrossCheckEvidence(
  evidence: string,
  type: CrossCheckType,
  agentName: string | null,
): string {
  return isSafeWording(evidence, agentName) ? tidy(evidence) : CROSS_CHECK_FALLBACK[type];
}
