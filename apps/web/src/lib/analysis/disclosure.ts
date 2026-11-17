import type { Disclosure, DisclosureMatch, DisclosureSource, Listing } from "@aiview/shared";

/**
 * Wording an agent might use to say images were digitally altered. Plain
 * text matching, no model involved. "AI" is matched in capitals only so
 * ordinary words are not mistaken for it.
 */
const PATTERNS: RegExp[] = [
  /\bA\.?I\.?(?![\w.])/,
  /\bartificial(?:ly)? intelligen\w+/i,
  /\bvirtual(?:ly)?[- ](?:stag\w+|furnish\w+|furniture|decorat\w+|renovat\w+|dress\w+)/i,
  /\bCGIs?\b/i,
  /\bcomputer[- ]generated\b/i,
  /\bdigital(?:ly)?[- ](?:enhanc\w+|alter\w+|stag\w+|furnish\w+|edit\w+|modif\w+|creat\w+|generat\w+|render\w+|remov\w+|declutter\w+|retouch\w+)/i,
  /\b(?:for )?illustrati(?:ve|on) purposes\b/i,
  /\bartist'?s'? impressions?\b/i,
  /\b(?:images?|photos?|photographs?|pictures?) (?:have|has|may have) been (?:\w+ )?(?:enhanced|altered|edited|staged|modified|retouched)\b/i,
  /\b(?:enhanced|altered|edited|staged|retouched) (?:images?|photos?|photographs?)\b/i,
];

const EXCERPT_RADIUS = 60;

function excerptAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - EXCERPT_RADIUS);
  const to = Math.min(text.length, end + EXCERPT_RADIUS);
  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

function matchesIn(text: string, source: DisclosureSource): DisclosureMatch[] {
  const matches: DisclosureMatch[] = [];
  for (const pattern of PATTERNS) {
    const found = pattern.exec(text);
    if (found === null) continue;
    matches.push({
      term: found[0],
      source,
      excerpt: excerptAround(text, found.index, found.index + found[0].length),
    });
  }
  return matches;
}

export function checkDisclosure(
  listing: Pick<Listing, "description" | "keyFeatures" | "photos" | "floorPlans">,
): Disclosure {
  const matches: DisclosureMatch[] = [
    ...matchesIn(listing.description, "description"),
    ...listing.keyFeatures.flatMap((feature) => matchesIn(feature, "key_features")),
    ...[...listing.photos, ...listing.floorPlans].flatMap((image) =>
      image.caption === null ? [] : matchesIn(image.caption, "photo_caption"),
    ),
  ];
  return { status: matches.length > 0 ? "disclosed" : "not_disclosed", matches };
}
