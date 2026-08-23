import { locationsInUse } from "./locationAvailability";
import { Project } from "./types";

/** A compact snapshot of the active project sent to the chat backend as
 * prompt context — deliberately NOT the full Project object (which
 * carries the whole breakdown/schedule/call sheets/feed history and
 * would bloat every chat turn for no benefit). Just enough for the
 * assistant to answer questions and know who/what it can act on with
 * the fixed tool set in chat_routes.py. Keep this in sync with that
 * file's system prompt if the action set grows. */
export function buildChatContext(project: Project): Record<string, unknown> {
  const cast = project.breakdown?.cast.map((c) => ({
    name: c.name,
    role: c.role_size,
    email: project.castEmails?.[c.name] || undefined,
    priority: project.castPriority?.[c.name] || undefined,
  })) ?? [];

  const crew = (project.crew ?? []).map((c) => ({
    name: c.name,
    role: c.role,
    email: c.email || undefined,
    priority: c.priority || undefined,
  }));

  const locations = project.breakdown
    ? locationsInUse(project.breakdown, project.schedule)
    : [];

  const shootDays = project.schedule?.shoot_days.map((d) => ({
    day_number: d.day_number,
    date: d.date || undefined,
    locations: d.locations,
  }));

  return {
    project_name: project.breakdown?.project_name || project.name,
    cast,
    crew,
    locations,
    proposed_shoot_window: project.proposedPeriod ?? undefined,
    shoot_days: shootDays,
  };
}
