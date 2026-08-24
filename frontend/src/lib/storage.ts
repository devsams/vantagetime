import { emptyCallSheetDayExtras, emptyProductionInfo } from "./callSheetExtras";
import { emptyAvailability, emptyOtherItem } from "./locationAvailability";
import { emptyCompanyProfile, emptySettings, emptyTeamMember } from "./settings";
import { humanizeFileName } from "./text";
import { AppSettings, Project } from "./types";

const STORAGE_KEY = "vantagetime.projects.v2";
const SETTINGS_KEY = "vantagetime.settings.v1";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // archived was a plain boolean before status replaced it with three
    // states (live/inProgress/archived) — kept here, typed loosely, only
    // so the backfill below can still read it off old saved projects.
    const parsed = JSON.parse(raw) as (Project & { archived?: boolean })[];
    if (!Array.isArray(parsed)) return [];
    // Backfill fields added after some projects were already saved, so
    // older localStorage entries don't crash newer components.
    return parsed.map(({ archived: legacyArchived, ...p }) => ({
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
      // cast_hours (and the weather/sunrise/sunset fields) were added to
      // ShootDay after some schedules were already saved — a shoot day
      // from before that crashes every component that reads
      // day.cast_hours.length without this, since JSON.parse doesn't
      // invent missing array fields. Backfilled here, once, rather than
      // defensively in every component that touches a ShootDay.
      schedule: p.schedule
        ? {
            ...p.schedule,
            shoot_days: p.schedule.shoot_days.map((d) => ({
              ...d,
              scenes: d.scenes ?? [],
              locations: d.locations ?? [],
              cast_hours: d.cast_hours ?? [],
              call_time_note: d.call_time_note ?? "",
              weather_flag: d.weather_flag ?? "",
              sunrise: d.sunrise ?? "",
              sunset: d.sunset ?? "",
            })),
          }
        : p.schedule,
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
      tasks: p.tasks ?? [],
      locationOutreach: p.locationOutreach ?? {},
      status: p.status ?? (legacyArchived ? "archived" : "inProgress"),
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

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return emptySettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return emptySettings();
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      companyProfile: { ...emptyCompanyProfile(), ...(parsed.companyProfile ?? {}) },
      team: (parsed.team ?? []).map((m) => ({ ...emptyTeamMember(m.id), ...m })),
    };
  } catch {
    return emptySettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are small (a handful of text fields) — quota exceeded here
    // would mean localStorage is already essentially full from project
    // data elsewhere. Nothing safe to drop from settings itself, so just
    // leave the previous saved state in place, same as saveProjects.
  }
}
