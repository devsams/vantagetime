import { emptyCallSheetDayExtras, emptyProductionInfo } from "./callSheetExtras";
import { emptyAvailability, emptyOtherItem } from "./locationAvailability";
import { humanizeFileName } from "./text";
import { Project } from "./types";

const STORAGE_KEY = "vantagetime.projects.v2";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    if (!Array.isArray(parsed)) return [];
    // Backfill fields added after some projects were already saved, so
    // older localStorage entries don't crash newer components.
    return parsed.map((p) => ({
      ...p,
      // Roster-imported projects (only) start out with breakdown.project_name
      // set verbatim from the uploaded file's name — early versions saved
      // that raw ("day_1_production_details_test") straight to storage
      // before it was cleaned up into a display name. Re-clean it on every
      // load so already-saved projects pick up the fix without needing a
      // re-upload; harmless no-op once it's already clean. Never touches
      // script-derived titles, which are real creative titles, not
      // filenames, and may legitimately contain characters this would
      // otherwise mangle.
      breakdown:
        p.startedFrom === "roster" && p.breakdown
          ? { ...p.breakdown, project_name: humanizeFileName(p.breakdown.project_name) }
          : p.breakdown,
      sourceDocument: p.sourceDocument ?? null,
      locationResearch: p.locationResearch ?? {},
      availabilityLinks: p.availabilityLinks ?? {},
      castEmails: p.castEmails ?? {},
      castPriority: p.castPriority ?? {},
      castAvailabilityNote: p.castAvailabilityNote ?? {},
      crew: (p.crew ?? []).map((c) => ({ ...c, priority: c.priority ?? false })),
      proposedPeriod: p.proposedPeriod ?? null,
      locationAvailability: Object.fromEntries(
        Object.entries(p.locationAvailability ?? {}).map(([name, a]) => [
          name,
          { ...emptyAvailability(name), ...a },
        ])
      ),
      otherItems: (p.otherItems ?? []).map((item) => ({
        ...emptyOtherItem(item.id, item.name, item.email),
        ...item,
      })),
      productionInfo: { ...emptyProductionInfo(), ...(p.productionInfo ?? {}) },
      callSheetExtras: Object.fromEntries(
        Object.entries(p.callSheetExtras ?? {}).map(([day, extras]) => [
          Number(day),
          { ...emptyCallSheetDayExtras(), ...extras },
        ])
      ),
      feed: p.feed ?? [],
      chatThreads: p.chatThreads ?? [],
    }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Quota exceeded (most likely cause: stored source documents adding
    // up across projects, even under the per-file size cap) — retry
    // once without them rather than losing every other bit of saved
    // state. The size cap in lib/files.ts prevents most cases of this;
    // this is the fallback for the rest.
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(projects.map((p) => ({ ...p, sourceDocument: null })))
      );
    } catch {
      // Still over quota even without documents — nothing more to
      // safely drop, so just leave the previous saved state in place.
    }
  }
}
