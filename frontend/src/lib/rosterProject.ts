import { emptyAvailability, emptyOtherItem } from "./locationAvailability";
import { RosterImportResult, RosterLocation } from "./api";
import { Breakdown, CrewMember, LocationAvailability, OtherItem, Project, Schedule } from "./types";

function emptyBreakdown(
  projectName: string,
  cast: Breakdown["cast"],
  locations: Breakdown["locations"]
): Breakdown {
  return {
    project_name: projectName,
    logline: "",
    format: "",
    page_count: 0,
    scene_count: 0,
    estimated_runtime_minutes: 0,
    scenes: [],
    cast,
    locations,
    props: [],
    production_flags: [],
    notes_for_scheduling:
      "Imported from a production-data spreadsheet — no script breakdown yet, so scenes and props start empty.",
    updated_this_turn: "",
  };
}

function emptySchedule(): Schedule {
  return {
    shoot_days: [],
    valid: true,
    validator_issues: [],
    first_attempt: null,
    calendar_error: "",
    updated_this_turn: "",
  };
}

function availabilityNoteFrom(p: { availability_start: string; availability_end: string }): string {
  if (p.availability_start && p.availability_end) {
    return `Stated availability (from import): ${p.availability_start} to ${p.availability_end} — not yet confirmed via their own link.`;
  }
  if (p.availability_start) return `Stated availability (from import): from ${p.availability_start}.`;
  if (p.availability_end) return `Stated availability (from import): until ${p.availability_end}.`;
  return "";
}

/** Fills in every piece of frontend project state a spreadsheet import
 * can supply directly — cast, crew, "Other" items, location constraints,
 * a proposed shooting period — from the backend's deterministic CSV
 * parse. Deliberately never touches scenes/schedule/call sheets: a
 * roster spreadsheet has no scene-level information, so those stages
 * just start empty, exactly like a brand-new script project before its
 * first pipeline run. The scheduling/call-sheet machinery doesn't need
 * to know or care that this project didn't start from a script. */
export function applyRosterImport(base: Project, result: RosterImportResult): Project {
  const actors = result.people.filter((p) => p.type === "actor");
  const crewRows = result.people.filter((p) => p.type === "crew");
  const otherRows = result.people.filter((p) => p.type === "other");

  // Union of explicit Type=Location rows and any location name only
  // mentioned in a person's Location column — the latter has no
  // constraint data (just a name), so it correctly starts as "needs
  // review" rather than being assumed fine.
  const locationNames = new Set<string>();
  result.locations.forEach((l) => locationNames.add(l.name));
  result.people.forEach((p) => p.location && locationNames.add(p.location));
  const locationByName = new Map<string, RosterLocation>(result.locations.map((l) => [l.name, l]));

  const cast: Breakdown["cast"] = actors.map((a) => ({
    name: a.name,
    scene_count: 0,
    role_size: a.role || "Cast",
  }));
  const locationsList: Breakdown["locations"] = Array.from(locationNames).map((name) => ({
    name,
    scene_count: 0,
    int_ext: "",
  }));

  const crew: CrewMember[] = crewRows.map((c) => ({
    id: crypto.randomUUID(),
    name: c.name,
    role: c.role || "Crew",
    email: c.email,
    priority: c.priority,
    availabilityNote: availabilityNoteFrom(c) || undefined,
  }));

  const otherItems: OtherItem[] = otherRows.map((o) => ({
    ...emptyOtherItem(crypto.randomUUID(), o.name, o.email),
    windowStart: o.availability_start,
    windowEnd: o.availability_end,
    priority: o.priority,
  }));

  const castEmails: Record<string, string> = {};
  const castPriority: Record<string, boolean> = {};
  const castAvailabilityNote: Record<string, string> = {};
  actors.forEach((a) => {
    if (a.email) castEmails[a.name] = a.email;
    if (a.priority) castPriority[a.name] = true;
    const note = availabilityNoteFrom(a);
    if (note) castAvailabilityNote[a.name] = note;
  });

  const locationAvailability: Record<string, LocationAvailability> = {};
  locationNames.forEach((name) => {
    const l = locationByName.get(name);
    locationAvailability[name] = {
      ...emptyAvailability(name),
      windowStart: l?.availability_start ?? "",
      windowEnd: l?.availability_end ?? "",
    };
  });

  const allStarts = [...result.people, ...result.locations]
    .map((x) => x.availability_start)
    .filter(Boolean)
    .sort();
  const allEnds = [...result.people, ...result.locations]
    .map((x) => x.availability_end)
    .filter(Boolean)
    .sort();
  const proposedPeriod =
    allStarts.length > 0 && allEnds.length > 0
      ? { start: allStarts[0], end: allEnds[allEnds.length - 1] }
      : null;

  return {
    ...base,
    startedFrom: "roster",
    breakdown: emptyBreakdown(base.name, cast, locationsList),
    schedule: emptySchedule(),
    crew,
    otherItems,
    castEmails,
    castPriority,
    castAvailabilityNote,
    locationAvailability,
    proposedPeriod,
  };
}
