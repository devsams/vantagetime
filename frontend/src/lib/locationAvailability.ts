import { AvailabilityConstraint, LocationAvailability, OtherItem, ProposedPeriod, ShootDay } from "./types";

// JS Date.getUTCDay() convention: 0=Sun, 1=Mon, ... 6=Sat. Displayed
// Mon-first since that's how a shoot calendar reads, but stored in this
// order so date-math (`getUTCDay()`) never needs remapping.
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function emptyConstraint(): AvailabilityConstraint {
  return {
    daysOfWeek: [],
    windowStart: "",
    windowEnd: "",
    preferredDates: [],
    timeStart: "",
    timeEnd: "",
    notes: "",
    priority: false,
  };
}

export function emptyAvailability(location: string): LocationAvailability {
  return {
    location,
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    ...emptyConstraint(),
  };
}

export function emptyOtherItem(id: string, name = "", email = ""): OtherItem {
  return { id, name, email, ...emptyConstraint() };
}

export function isEmptyAvailability(a: AvailabilityConstraint): boolean {
  return (
    a.daysOfWeek.length === 0 &&
    !a.windowStart &&
    !a.windowEnd &&
    a.preferredDates.length === 0 &&
    !a.timeStart &&
    !a.timeEnd &&
    !a.notes.trim() &&
    !a.priority
  );
}

/** The shoot range already known to the project — real assigned shoot
 * dates if any exist, otherwise the soft Proposed Shooting Period.
 * Used to default a new location's (or rented item's) window to dates
 * we already have, instead of asking the filmmaker to retype them. */
export function shootDateRange(
  shootDays: ShootDay[],
  proposedPeriod: ProposedPeriod | null
): { start: string; end: string } | null {
  const dates = shootDays.map((d) => d.date).filter(Boolean).sort();
  if (dates.length > 0) return { start: dates[0], end: dates[dates.length - 1] };
  if (proposedPeriod) return { start: proposedPeriod.start, end: proposedPeriod.end };
  return null;
}

function formatTimeRange(a: AvailabilityConstraint): string {
  if (a.timeStart && a.timeEnd) return `${a.timeStart}–${a.timeEnd}`;
  if (a.timeStart) return `from ${a.timeStart}`;
  if (a.timeEnd) return `until ${a.timeEnd}`;
  return "";
}

/** Compact summary of the constraint itself — reused for locations and
 * "Other" rental items alike, so no name/label needed here. */
export function describeAvailability(a: AvailabilityConstraint): string {
  const parts: string[] = [];
  if (a.daysOfWeek.length > 0) {
    parts.push(`only ${a.daysOfWeek.slice().sort().map((d) => DAY_LABELS[d]).join("/")}`);
  }
  if (a.windowStart && a.windowEnd) {
    parts.push(`${a.windowStart} to ${a.windowEnd}`);
  } else if (a.windowStart) {
    parts.push(`from ${a.windowStart}`);
  } else if (a.windowEnd) {
    parts.push(`until ${a.windowEnd}`);
  }
  const timeRange = formatTimeRange(a);
  if (timeRange) parts.push(timeRange);
  if (a.preferredDates.length > 0) {
    parts.push(`prefers ${a.preferredDates.slice().sort().join(", ")}`);
  }
  return parts.join(" · ");
}

/** Real date-of-week and range arithmetic — not an LLM guess. Returns a
 * human-readable violation message (using `label` — a location name or
 * an "Other" item's name — in the sentence), or null if the date is
 * fine (or there's nothing to check). Only checks the HARD constraints
 * (days of week, date window) — preferred dates are a soft signal,
 * checked separately by checkPreferred, and time-of-day is
 * informational only since a shoot day only has a date, not a
 * scheduled call time. */
export function checkAvailability(dateStr: string, label: string, a: AvailabilityConstraint): string | null {
  if (!dateStr) return null;
  if (a.daysOfWeek.length > 0) {
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    if (!a.daysOfWeek.includes(dow)) {
      return `${label} is only available on ${a.daysOfWeek
        .slice()
        .sort()
        .map((d) => DAY_LABELS[d])
        .join(", ")}, but this day is dated ${DAY_LABELS[dow]} ${dateStr}.`;
    }
  }
  if (a.windowStart && dateStr < a.windowStart) {
    return `${label} isn't available until ${a.windowStart}, but this day is dated ${dateStr}.`;
  }
  if (a.windowEnd && dateStr > a.windowEnd) {
    return `${label} isn't available after ${a.windowEnd}, but this day is dated ${dateStr}.`;
  }
  return null;
}

/** Soft check: does this date match one of the stated preferred dates?
 * Only meaningful when preferredDates is non-empty — returns null (no
 * note) otherwise, since "no preference given" isn't a mismatch. This
 * never blocks anything; it's a nudge, not an error. */
export function checkPreferred(dateStr: string, label: string, a: AvailabilityConstraint): string | null {
  if (!dateStr || a.preferredDates.length === 0) return null;
  if (a.preferredDates.includes(dateStr)) return null;
  return `${label} prefers ${a.preferredDates.slice().sort().join(", ")} — this day is dated ${dateStr}.`;
}

/** Searches forward day-by-day (capped at ~4 months out) for the next
 * date that satisfies these hard constraints and isn't already used by
 * another shoot day — real search, not a guess. If there are preferred
 * dates, an unused, still-valid preferred date is tried first; only
 * falls back to the general day-by-day search if none of the preferred
 * dates work. */
export function findNextAllowedDate(
  fromDateStr: string,
  a: AvailabilityConstraint,
  takenDates: Set<string>
): string | null {
  if (a.preferredDates.length > 0) {
    const preferredHit = a.preferredDates
      .slice()
      .sort()
      .find((iso) => iso > fromDateStr && !takenDates.has(iso) && !checkAvailability(iso, "", a));
    if (preferredHit) return preferredHit;
  }

  const cursor = new Date(`${fromDateStr}T00:00:00Z`);
  for (let i = 0; i < 120; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (a.windowEnd && iso > a.windowEnd) return null;
    if (takenDates.has(iso)) continue;
    if (a.daysOfWeek.length > 0 && !a.daysOfWeek.includes(cursor.getUTCDay())) continue;
    if (a.windowStart && iso < a.windowStart) continue;
    return iso;
  }
  return null;
}
