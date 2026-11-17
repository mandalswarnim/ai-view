import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

export function fixtureNames(portal: string): string[] {
  return readdirSync(join(FIXTURES, portal)).filter((name) => name.endsWith(".html"));
}

export function loadFixture(portal: string, name: string): Document {
  return documentFrom(readFileSync(join(FIXTURES, portal, name), "utf8"));
}

export function documentFrom(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}
