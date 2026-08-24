import { Breakdown, CastHours, Schedule, Scene, ShootDay } from "./types";

// Same constants as backend/common/tools.py's estimate_cast_hours — kept
// in sync by hand since this is a small, stable, documented assumption
// (not tunable by the agent there either). A manual stripboard move
// needs to recompute cast_hours entirely client-side (no round trip to
// the agent for a drag-and-drop reorder), so the formula is duplicated
// here rather than shared, and must produce identical numbers.
const DEFAULT_SHOOT_HOURS = 10;
const MIN_CALL_HOURS = 2;

/** Mirrors backend/common/tools.py's estimate_cast_hours exactly. Only
 * call this to recompute a day whose scene list changed by hand (a
 * stripboard move) — every agent-generated day already has real
 * cast_hours from the backend and should never be recomputed here. */
export function estimateCastHours(
  scenes: Pick<Scene, "page_count" | "characters">[],
  totalShootHours = DEFAULT_SHOOT_HOURS
): CastHours[] {
  const totalPages = scenes.reduce((sum, s) => sum + (s.page_count || 0), 0);
  const charPages: Record<string, number> = {};
  for (const s of scenes) {
    for (const name of s.characters || []) {
      charPages[name] = (charPages[name] || 0) + (s.page_count || 0);
    }
  }
  return Object.entries(charPages).map(([name, pages]) => {
    const share = totalPages > 0 ? pages / totalPages : 0;
    let hours = Math.max(MIN_CALL_HOURS, Math.round(share * totalShootHours * 2) / 2);
    hours = Math.min(hours, totalShootHours);
    return { name, hours_needed: hours };
  });
}

/** Recomputes a shoot day's derived fields (locations, total_pages,
 * cast_hours) from a new scene order — everything else about the day
 * (date, weather, call_time_note, sunrise/sunset...) is left untouched,
 * since a manual scene reshuffle doesn't change any of that. */
export function recomputeDay(day: ShootDay, sceneNumbers: number[], breakdown: Breakdown): ShootDay {
  const byNumber = new Map(breakdown.scenes.map((s) => [s.number, s]));
  const scenesOnDay = sceneNumbers.map((n) => byNumber.get(n)).filter((s): s is Scene => !!s);
  const locations = Array.from(new Set(scenesOnDay.map((s) => s.location)));
  const totalPages = Math.round(scenesOnDay.reduce((sum, s) => sum + (s.page_count || 0), 0) * 1000) / 1000;
  return {
    ...day,
    scenes: sceneNumbers,
    locations,
    total_pages: totalPages,
    cast_hours: estimateCastHours(scenesOnDay),
  };
}

/** Moves one scene from one shoot day to another (or reorders within
 * the same day) and recomputes both affected days. The single entry
 * point the Stripboard UI calls on every drop; never mutates its
 * arguments, always returns a new Schedule object. */
export function moveScene(
  schedule: Schedule,
  breakdown: Breakdown,
  sceneNumber: number,
  fromDay: number,
  toDay: number,
  toIndex: number
): Schedule {
  const days = schedule.shoot_days.map((d) => ({ ...d, scenes: [...(d.scenes ?? [])] }));
  const from = days.find((d) => d.day_number === fromDay);
  const to = days.find((d) => d.day_number === toDay);
  if (!from || !to) return schedule;

  const fromIdx = from.scenes.indexOf(sceneNumber);
  if (fromIdx === -1) return schedule;
  from.scenes.splice(fromIdx, 1);

  let insertAt = toIndex;
  if (from === to && fromIdx < insertAt) insertAt -= 1;
  insertAt = Math.max(0, Math.min(insertAt, to.scenes.length));
  to.scenes.splice(insertAt, 0, sceneNumber);

  const nextDays = days.map((d) => {
    if (d.day_number === from.day_number || d.day_number === to.day_number) {
      return recomputeDay(d, d.scenes, breakdown);
    }
    return d;
  });

  return { ...schedule, shoot_days: nextDays };
}

// --- Stripboard color coding — the standard convention scheduling
// software (Movie Magic, EP, Yamdu) uses: white=INT DAY, yellow=EXT
// DAY, blue=INT NIGHT, green=EXT NIGHT, pink=DAWN/DUSK/magic hour,
// goldenrod=anything that doesn't parse cleanly. Purely cosmetic,
// computed fresh from each scene's own int_ext/time_of_day — never
// stored, never affects scheduling logic. ---

export type StripColor = "white" | "yellow" | "blue" | "green" | "pink" | "goldenrod";

export function stripColor(scene: Pick<Scene, "int_ext" | "time_of_day">): StripColor {
  const isExt = /ext/i.test(scene.int_ext || "");
  const tod = (scene.time_of_day || "").toLowerCase();
  if (/dawn|dusk|magic\s*hour|golden\s*hour|sunset|sunrise/.test(tod)) return "pink";
  if (/night|evening|late|midnight/.test(tod)) return isExt ? "green" : "blue";
  // "DAY" is the standard slugline marker, but real breakdowns also use
  // MORNING/AFTERNOON/NOON — all real daylight, none of them literally
  // contain "day", so they'd otherwise fall through to the goldenrod
  // catch-all for no good reason.
  if (/day|morning|afternoon|\bnoon\b/.test(tod)) return isExt ? "yellow" : "white";
  return "goldenrod";
}

export const STRIP_COLOR_STYLES: Record<StripColor, string> = {
  white: "bg-white text-neutral-900 border-neutral-300",
  yellow: "bg-yellow-200 text-neutral-900 border-yellow-400",
  blue: "bg-blue-200 text-neutral-900 border-blue-400",
  green: "bg-green-200 text-neutral-900 border-green-400",
  pink: "bg-pink-200 text-neutral-900 border-pink-400",
  goldenrod: "bg-amber-300 text-neutral-900 border-amber-500",
};

export const STRIP_COLOR_LABELS: Record<StripColor, string> = {
  white: "INT DAY",
  yellow: "EXT DAY",
  blue: "INT NIGHT",
  green: "EXT NIGHT",
  pink: "DAWN/DUSK",
  goldenrod: "OTHER",
};
