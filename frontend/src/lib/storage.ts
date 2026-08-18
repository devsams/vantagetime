import { emptyCallSheetDayExtras, emptyProductionInfo } from "./callSheetExtras";
import { emptyAvailability, emptyOtherItem } from "./locationAvailability";
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
      locationResearch: p.locationResearch ?? {},
      availabilityLinks: p.availabilityLinks ?? {},
      castEmails: p.castEmails ?? {},
      castPriority: p.castPriority ?? {},
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
    }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
