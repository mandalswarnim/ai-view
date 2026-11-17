/**
 * Reads the JSON object literal that follows `marker` in a script's source,
 * e.g. `window.PAGE_MODEL = {...}`. Returns undefined when the marker is
 * absent or what follows is not valid JSON.
 */
export function readJsonAfter(source: string, marker: string): unknown {
  const at = source.indexOf(marker);
  if (at === -1) return undefined;
  const start = source.indexOf("{", at + marker.length);
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  pound: "£",
};

/** Turns a fragment of listing HTML into plain text without touching the DOM. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number") return String(value);
  return null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Resolves protocol-relative and http image URLs to https. */
export function toHttpsUrl(value: unknown): string | null {
  const raw = asString(value);
  if (raw === null) return null;
  const withScheme = raw.startsWith("//") ? `https:${raw}` : raw.replace(/^http:/, "https:");
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/**
 * Rebuilds a value from the flattened form Rightmove now uses for its page
 * model (the "devalue" format): one array in which every object property and
 * array item is the index of its value, with the root at index 0. Negative
 * indexes stand for undefined, NaN and similar, and are read as null.
 */
export function unflatten(table: unknown): unknown {
  if (!Array.isArray(table) || table.length === 0) return undefined;
  const entries: unknown[] = table;
  const resolved = new Map<number, unknown>();

  function resolve(index: unknown): unknown {
    if (typeof index !== "number" || index < 0 || index >= entries.length) return null;
    if (resolved.has(index)) return resolved.get(index);

    const raw: unknown = entries[index];
    if (Array.isArray(raw)) {
      // A leading string marks a special type such as ["Date", "2025-..."].
      if (typeof raw[0] === "string") {
        const value = raw[0] === "Date" && typeof raw[1] === "string" ? raw[1] : null;
        resolved.set(index, value);
        return value;
      }
      const list: unknown[] = [];
      resolved.set(index, list);
      for (const item of raw) list.push(resolve(item));
      return list;
    }
    if (typeof raw === "object" && raw !== null) {
      const record: Record<string, unknown> = {};
      resolved.set(index, record);
      for (const [key, value] of Object.entries(raw)) record[key] = resolve(value);
      return record;
    }
    resolved.set(index, raw);
    return raw;
  }

  return resolve(0);
}
