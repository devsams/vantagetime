import { castNamesForDay } from "./calendar";
import { Breakdown, Schedule } from "./types";

/** One cell in the Day-Out-Of-Days grid for a single cast member on a
 * single shoot day:
 *  - "W"  work day — the character appears in a scene scheduled that day
 *  - "H"  hold — a day between this person's first and last work day
 *         where they're not shooting (standard DOOD notation; the
 *         production is still holding their availability)
 *  - ""   outside this person's span entirely (before their first or
 *         after their last work day) */
export type DoodStatus = "W" | "H" | "";

export interface DoodRow {
  name: string;
  statuses: DoodStatus[]; // one per schedule.shoot_days entry, same order
  workDays: number;
  holdDays: number;
  spanDays: number; // workDays + holdDays — first work day through last, inclusive
  startDate: string; // shoot_days[].date of first work day, "" if unset
  endDate: string; // shoot_days[].date of last work day, "" if unset
}

/** Computes the full Day-Out-Of-Days report from the current schedule —
 * purely derived (never stored), so it's always in sync with whatever
 * the schedule looks like right now, including after a manual
 * stripboard move. One row per cast member who appears in any scheduled
 * scene, ordered by first work day (earliest first), ties broken
 * alphabetically. */
export function computeDood(schedule: Schedule, breakdown: Breakdown): DoodRow[] {
  const days = schedule.shoot_days;
  const workDaysByName = new Map<string, Set<number>>(); // name -> set of day_number

  days.forEach((day) => {
    for (const name of castNamesForDay(day, breakdown)) {
      if (!workDaysByName.has(name)) workDaysByName.set(name, new Set());
      workDaysByName.get(name)!.add(day.day_number);
    }
  });

  const rows: DoodRow[] = [];
  for (const [name, workSet] of workDaysByName) {
    if (workSet.size === 0) continue;
    const workDayNumbers = Array.from(workSet).sort((a, b) => a - b);
    const first = workDayNumbers[0];
    const last = workDayNumbers[workDayNumbers.length - 1];

    const statuses: DoodStatus[] = days.map((day) => {
      if (workSet.has(day.day_number)) return "W";
      if (day.day_number > first && day.day_number < last) return "H";
      return "";
    });

    const holdDays = statuses.filter((s) => s === "H").length;
    const firstDay = days.find((d) => d.day_number === first);
    const lastDay = days.find((d) => d.day_number === last);

    rows.push({
      name,
      statuses,
      workDays: workDayNumbers.length,
      holdDays,
      spanDays: workDayNumbers.length + holdDays,
      startDate: firstDay?.date ?? "",
      endDate: lastDay?.date ?? "",
    });
  }

  rows.sort((a, b) => {
    const aFirst = a.statuses.findIndex((s) => s === "W");
    const bFirst = b.statuses.findIndex((s) => s === "W");
    if (aFirst !== bFirst) return aFirst - bFirst;
    return a.name.localeCompare(b.name);
  });

  return rows;
}
