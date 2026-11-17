import type {
  Confidence,
  CrossCheckType,
  FindingCategory,
  OverallStatus,
} from "./report";

/**
 * User-facing wording. Kept in one place because it carries legal risk: the
 * product describes what it sees ("signs consistent with", "may have been")
 * and never states that a listing or agent has done something wrong.
 */

export const STATUS_LABELS: Record<OverallStatus, string> = {
  no_concerns: "No concerns found",
  enhanced_disclosed: "Enhanced and disclosed",
  enhanced_not_disclosed: "Enhanced, not disclosed",
  possible_structural_or_concealment: "Possible structural or concealment edits",
};

export const STATUS_SUMMARIES: Record<OverallStatus, string> = {
  no_concerns:
    "The automated check did not find signs of AI editing in these photos.",
  enhanced_disclosed:
    "The photos may have been digitally enhanced, and the listing says so.",
  enhanced_not_disclosed:
    "The photos show signs consistent with digital enhancement, and the listing text does not mention it.",
  possible_structural_or_concealment:
    "Some photos show signs consistent with edits to the structure of a room, or to areas where defects may be hidden. Check these in person.",
};

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  cosmetic: "Cosmetic",
  staging: "Staging",
  structural: "Structural",
  concealment: "Possible concealment",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const CROSS_CHECK_LABELS: Record<CrossCheckType, string> = {
  photo_inconsistency: "Photos of the same room differ",
  floorplan_openings: "Windows or doors differ from the floor plan",
  floorplan_dimensions: "Room size differs from the floor plan",
  wide_angle: "Wide-angle lens",
};

export const DISCLOSURE_LABELS = {
  disclosed: "The listing mentions digital editing",
  not_disclosed: "The listing does not mention digital editing",
} as const;
