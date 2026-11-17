import type {
  Confidence,
  CrossCheck,
  Disclosure,
  Finding,
  OverallStatus,
} from "@aiview/shared";

/**
 * Low-confidence observations are shown to the user but do not move the
 * overall status: a headline about possible structural edits needs at least
 * medium confidence behind it.
 */
export function countsTowardStatus(confidence: Confidence): boolean {
  return confidence !== "low";
}

/**
 * The overall status is decided here, never by the model.
 *
 * 1. Any counted structural or concealment finding, or any counted
 *    cross-check other than wide-angle distortion (a lens effect, not an
 *    edit), gives "possible structural or concealment edits".
 * 2. Otherwise any counted finding, or a disclosure in the listing text,
 *    gives "enhanced", split by whether the listing disclosed it.
 * 3. Otherwise "no concerns found".
 */
export function deriveStatus(
  findings: readonly Finding[],
  crossChecks: readonly CrossCheck[],
  disclosure: Disclosure,
): OverallStatus {
  const counted = findings.filter((finding) => countsTowardStatus(finding.confidence));

  const seriousFinding = counted.some(
    (finding) => finding.category === "structural" || finding.category === "concealment",
  );
  const seriousCrossCheck = crossChecks.some(
    (check) => check.type !== "wide_angle" && countsTowardStatus(check.confidence),
  );
  if (seriousFinding || seriousCrossCheck) return "possible_structural_or_concealment";

  const disclosed = disclosure.status === "disclosed";
  if (counted.length > 0) return disclosed ? "enhanced_disclosed" : "enhanced_not_disclosed";
  return disclosed ? "enhanced_disclosed" : "no_concerns";
}
