/** Formatting helpers for turning agent-written prose (research notes,
 * weather summaries, permit blurbs — all free text from a web-search
 * agent) into something scannable in a UI, instead of a dense paragraph
 * nobody actually reads on set. */

/** Splits a paragraph into short, sentence-sized bullets and caps the
 * count so a location card or dashboard section stays skimmable. Pure
 * text splitting — no attempt to re-parse into rigid fields, since the
 * source is free-form agent text and guessing a schema onto it would be
 * more likely to misread it than to help. */
export function toBullets(text: string, max = 4): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** "2026-08-31" -> "Mon, Aug 31". Falls back to the raw string if it
 * isn't a real date (never throws on bad input). */
export function friendlyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "2026-08-31" -> "Aug 31, 2026" — used where the weekday isn't needed. */
export function friendlyDateWithYear(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "day_1_production_details_test" -> "Day 1 Production Details Test".
 * A project created from an uploaded roster/script starts out named
 * after the file (extension already stripped by the caller) — raw
 * filenames are snake_case or kebab-case far more often than not, and
 * showing that verbatim in a big display-font title looks like a bug,
 * not a name. Purely cosmetic: underscores/hyphens/extra whitespace
 * become single spaces and each word is capitalized; nothing here
 * changes what's actually stored as the project's identity. */
export function humanizeFileName(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return name;
  return spaced
    .split(" ")
    .map((word) => (/^[0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
