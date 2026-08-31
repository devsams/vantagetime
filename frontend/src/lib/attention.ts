import { unreviewedLocations } from "./locationAvailability";
import { Project } from "./types";

export interface AttentionItem {
  id: string;
  label: string;
}

/** Everything across the whole project that's currently blocking or
 * waiting on the filmmaker — the same signals Autopilot's step cards
 * already check (roster, location review, outreach, cast emails), plus
 * any Task Master item that isn't done yet. Computed straight from
 * Project state (no extra network calls) so it can drive a bar that's
 * visible on every tab, not just Autopilot itself. Deliberately doesn't
 * include the shoot-window/candidate-date check — that lives in a
 * separate backend-only DateWindow fetch Autopilot already surfaces
 * live when opened. */
export function computeAttentionItems(project: Project): AttentionItem[] {
  const items: AttentionItem[] = [];
  const breakdown = project.breakdown;
  if (!breakdown) return items;

  const crewCount = (project.crew ?? []).length;
  const castCount = breakdown.cast.length;
  if (castCount === 0 && crewCount === 0) {
    items.push({ id: "no-roster", label: "No cast or crew added yet" });
  }

  const locationAvailability = project.locationAvailability ?? {};
  const unreviewed = unreviewedLocations(breakdown, project.schedule, locationAvailability);
  if (unreviewed.length > 0) {
    items.push({
      id: "unreviewed-locations",
      label: `${unreviewed.length} location${unreviewed.length === 1 ? "" : "s"} need${unreviewed.length === 1 ? "s" : ""} review`,
    });
  }

  const castEmails = project.castEmails ?? {};
  const castOutreach = project.castOutreach?.cast_outreach ?? [];
  const missingCastEmails = castOutreach.filter((c) => !castEmails[c.name]?.trim());
  if (missingCastEmails.length > 0) {
    items.push({
      id: "missing-cast-emails",
      label: `${missingCastEmails.length} cast member${missingCastEmails.length === 1 ? "" : "s"} missing an email`,
    });
  }

  const availabilityLinks = project.availabilityLinks ?? {};
  const notSentToActors = castOutreach.filter(
    (c) => castEmails[c.name]?.trim() && !availabilityLinks[c.name]
  );
  if (notSentToActors.length > 0) {
    items.push({
      id: "actor-outreach-pending",
      label: `${notSentToActors.length} actor${notSentToActors.length === 1 ? "" : "s"} not yet notified`,
    });
  }

  const openTasks = (project.tasks ?? []).filter((t) => t.status !== "done");
  if (openTasks.length > 0) {
    items.push({
      id: "open-tasks",
      label: `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}`,
    });
  }

  const timeCards = project.timeCards ?? [];
  const payRates = project.payRates ?? {};
  const openTimeCards = timeCards.filter((t) => t.status !== "approved");
  if (openTimeCards.length > 0) {
    items.push({
      id: "open-time-cards",
      label: `${openTimeCards.length} time card${openTimeCards.length === 1 ? "" : "s"} not yet approved`,
    });
  }
  const loggedWithNoRate = new Set(
    timeCards.filter((t) => !(payRates[t.personName]?.rate > 0)).map((t) => t.personName)
  );
  if (loggedWithNoRate.size > 0) {
    items.push({
      id: "missing-pay-rates",
      label: `${loggedWithNoRate.size} ${loggedWithNoRate.size === 1 ? "person has" : "people have"} logged time with no pay rate set`,
    });
  }

  return items;
}
