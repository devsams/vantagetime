"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import { castNamesForDay } from "@/lib/calendar";
import {
  fetchCancellations,
  fetchConfirmations,
  fetchProposals,
  registerAvailabilityLinks,
} from "@/lib/api";
import {
  Breakdown,
  Cancellation,
  Confirmation,
  CrewMember,
  DateProposal,
  LocationAvailability,
  OtherItem,
  ProposedPeriod,
  Schedule,
} from "@/lib/types";
import {
  checkAvailability,
  DAY_LABELS,
  describeAvailability,
  DISPLAY_ORDER,
  emptyAvailability,
  emptyOtherItem,
  findNextAllowedDate,
  isEmptyAvailability,
  shootDateRange,
} from "@/lib/locationAvailability";

type SubTab = "location" | "actors" | "crew" | "other";
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "location", label: "Location" },
  { key: "actors", label: "Actor" },
  { key: "crew", label: "Crew" },
  { key: "other", label: "Other" },
];

function newCrewId() {
  return `crew_${Math.random().toString(36).slice(2, 9)}`;
}

function newOtherId() {
  return `other_${Math.random().toString(36).slice(2, 9)}`;
}

// Crew isn't scene-specific like cast — a gaffer or DP is assumed
// needed for the full shoot day. This is a plain documented default,
// not a guess dressed up as a fact; the filmmaker can see it's an
// assumption right in the outreach email.
const DEFAULT_CREW_HOURS = 10;

function buildCrewEmail(
  crewMember: CrewMember,
  days: Schedule["shoot_days"],
  projectName: string,
  proposedPeriod: ProposedPeriod | null
): { subject: string; body: string } {
  const firstName = crewMember.name.split(" ")[0];
  const hasUndated = days.some((d) => !d.date);
  const dayLines = days
    .map((d) => `Day ${d.day_number}${d.date ? `, ${d.date}` : " (date TBD)"} — ${d.locations.join(", ")}`)
    .join("\n");
  const periodLine =
    hasUndated && proposedPeriod
      ? `We're aiming for somewhere between ${proposedPeriod.start} and ${proposedPeriod.end}. `
      : "";
  const ask = hasUndated
    ? `We haven't locked in exact dates yet. ${periodLine}Please open the link below and tell us at least 3 dates that work for you for each undated day.`
    : "Please confirm each day or flag any conflicts using the link below.";
  return {
    subject: `${projectName} — your shoot days`,
    body: `Hi ${firstName},\n\nHere's the shoot plan for ${projectName}${
      crewMember.role ? ` (${crewMember.role})` : ""
    }:\n\n${dayLines}\n\n${ask}`,
  };
}

interface Conflict {
  key: string;
  message: string;
  rescheduleText?: string;
  priority?: boolean;
}

interface DateSuggestion {
  day_number: number;
  best_date: string;
  covered_names: string[];
  priority_covered: number;
  cast_covered: number;
  crew_covered: number;
  total_proposers: number;
  in_proposed_period: boolean | null;
}

/** Real overlap counting, not a guess: for every day that has proposals,
 * find the candidate date that covers the most people. Priority-flagged
 * people (yes/no, set by the filmmaker) are the top sort tier — a date
 * only wins if it covers MORE priority people first. Cast coverage only
 * breaks ties between dates that cover the same number of priority
 * people, and crew coverage only breaks ties after that. If nobody has
 * been flagged priority, this collapses to plain cast-then-crew
 * ranking. Final ties keep whichever date sorts first alphabetically. */
function computeSuggestions(
  proposals: DateProposal[],
  castNames: Set<string>,
  priorityNames: Set<string>,
  proposedPeriod: ProposedPeriod | null
): DateSuggestion[] {
  const byDay = new Map<number, DateProposal[]>();
  for (const p of proposals) {
    if (!byDay.has(p.day_number)) byDay.set(p.day_number, []);
    byDay.get(p.day_number)!.push(p);
  }

  const suggestions: DateSuggestion[] = [];
  for (const [day_number, props] of byDay) {
    const namesByDate = new Map<string, Set<string>>();
    for (const p of props) {
      for (const date of p.dates) {
        if (!namesByDate.has(date)) namesByDate.set(date, new Set());
        namesByDate.get(date)!.add(p.actor_name);
      }
    }
    let bestDate = "";
    let bestNames: string[] = [];
    let bestPriorityCount = -1;
    let bestCastCount = -1;
    let bestCrewCount = -1;
    for (const [date, names] of Array.from(namesByDate).sort(([a], [b]) => a.localeCompare(b))) {
      const priorityCount = Array.from(names).filter((n) => priorityNames.has(n)).length;
      const castCount = Array.from(names).filter((n) => castNames.has(n)).length;
      const crewCount = names.size - castCount;
      const better =
        priorityCount > bestPriorityCount ||
        (priorityCount === bestPriorityCount &&
          (castCount > bestCastCount || (castCount === bestCastCount && crewCount > bestCrewCount)));
      if (better) {
        bestDate = date;
        bestNames = Array.from(names);
        bestPriorityCount = priorityCount;
        bestCastCount = castCount;
        bestCrewCount = crewCount;
      }
    }
    if (bestDate) {
      const inPeriod = proposedPeriod
        ? bestDate >= proposedPeriod.start && bestDate <= proposedPeriod.end
        : null;
      suggestions.push({
        day_number,
        best_date: bestDate,
        covered_names: bestNames,
        priority_covered: bestPriorityCount,
        cast_covered: bestCastCount,
        crew_covered: bestCrewCount,
        total_proposers: props.length,
        in_proposed_period: inPeriod,
      });
    }
  }
  return suggestions.sort((a, b) => a.day_number - b.day_number);
}

export default function PlanningSection({
  projectName,
  sessionId,
  breakdown,
  schedule,
  castEmails,
  castPriority,
  crew,
  availabilityLinks,
  proposedPeriod,
  locationAvailability,
  otherItems,
  onUpdateCastEmails,
  onUpdateCastPriority,
  onUpdateCrew,
  onUpdateProposedPeriod,
  onUpdateLocationAvailability,
  onUpdateOtherItems,
  onRequestReschedule,
  onLinksGenerated,
}: {
  projectName: string;
  sessionId: string;
  breakdown: Breakdown;
  schedule: Schedule;
  castEmails: Record<string, string>;
  castPriority: Record<string, boolean>;
  crew: CrewMember[];
  availabilityLinks: Record<string, string>;
  proposedPeriod: ProposedPeriod | null;
  locationAvailability: Record<string, LocationAvailability>;
  otherItems: OtherItem[];
  onUpdateCastEmails: (emails: Record<string, string>) => void;
  onUpdateCastPriority: (priority: Record<string, boolean>) => void;
  onUpdateCrew: (crew: CrewMember[]) => void;
  onUpdateProposedPeriod: (period: ProposedPeriod | null) => void;
  onUpdateLocationAvailability: (a: Record<string, LocationAvailability>) => void;
  onUpdateOtherItems: (items: OtherItem[]) => void;
  onRequestReschedule: (text: string) => void;
  onLinksGenerated: (links: Record<string, string>) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("location");
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");
  const [newCrewEmail, setNewCrewEmail] = useState("");
  const [newPreferredDate, setNewPreferredDate] = useState<Record<string, string>>({});
  const [newOtherName, setNewOtherName] = useState("");
  const [newOtherEmail, setNewOtherEmail] = useState("");
  const [newOtherPreferredDate, setNewOtherPreferredDate] = useState<Record<string, string>>({});
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [proposals, setProposals] = useState<DateProposal[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [checking, setChecking] = useState(false);
  const [sendingCrewLinks, setSendingCrewLinks] = useState(false);
  const [copiedCrewId, setCopiedCrewId] = useState<string | null>(null);

  const datedDays = schedule.shoot_days.filter((d) => d.date);
  const castNames = new Set(breakdown.cast.map((c) => c.name));
  const priorityNames = new Set([
    ...breakdown.cast.filter((c) => castPriority[c.name]).map((c) => c.name),
    ...crew.filter((c) => c.priority).map((c) => c.name),
  ]);
  const suggestions = computeSuggestions(proposals, castNames, priorityNames, proposedPeriod);
  // Already-known shoot dates (real assigned dates if set, else the soft
  // proposed period) — used to default a new location's window instead
  // of asking the filmmaker to retype dates we already have.
  const shootRange = shootDateRange(schedule.shoot_days, proposedPeriod);

  async function checkResponses() {
    setChecking(true);
    const [cancellationResult, proposalResult, confirmationResult] = await Promise.all([
      fetchCancellations(sessionId),
      fetchProposals(sessionId),
      fetchConfirmations(sessionId),
    ]);
    setCancellations(cancellationResult);
    setProposals(proposalResult);
    setConfirmations(confirmationResult);
    setChecking(false);
  }

  useEffect(() => {
    checkResponses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function setCastEmail(name: string, email: string) {
    onUpdateCastEmails({ ...castEmails, [name]: email });
  }

  function toggleCastPriority(name: string) {
    onUpdateCastPriority({ ...castPriority, [name]: !castPriority[name] });
  }

  function toggleCrewPriority(id: string) {
    onUpdateCrew(crew.map((c) => (c.id === id ? { ...c, priority: !c.priority } : c)));
  }

  function addCrewMember() {
    if (!newCrewName.trim() || !newCrewEmail.trim()) return;
    onUpdateCrew([
      ...crew,
      {
        id: newCrewId(),
        name: newCrewName.trim(),
        role: newCrewRole.trim(),
        email: newCrewEmail.trim(),
        priority: false,
      },
    ]);
    setNewCrewName("");
    setNewCrewRole("");
    setNewCrewEmail("");
  }

  function removeCrewMember(id: string) {
    onUpdateCrew(crew.filter((c) => c.id !== id));
  }

  async function sendCrewLinks() {
    if (crew.length === 0) return;
    setSendingCrewLinks(true);
    try {
      const links = await registerAvailabilityLinks(
        sessionId,
        projectName,
        crew.map((c) => ({
          name: c.name,
          scheduled_days: schedule.shoot_days.map((d) => ({
            day_number: d.day_number,
            locations: d.locations,
            date: d.date,
            hours_needed: DEFAULT_CREW_HOURS,
          })),
        })),
        proposedPeriod
      );
      onLinksGenerated(links);
    } catch {
      // Registration failing just means links stay ungenerated — the
      // draft content is still fully visible either way.
    }
    setSendingCrewLinks(false);
  }

  function copyCrewEmail(member: CrewMember) {
    const { subject, body } = buildCrewEmail(member, schedule.shoot_days, projectName, proposedPeriod);
    const token = availabilityLinks[member.name];
    const fullBody = token
      ? `${body}\n\nLet us know here: ${window.location.origin}/availability/${token}`
      : body;
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${fullBody}`);
    setCopiedCrewId(member.id);
    setTimeout(() => setCopiedCrewId(null), 1500);
  }

  // --- Location availability editing (Location sub-tab) ---

  function patchLocationAvailability(name: string, patch: Partial<LocationAvailability>) {
    const current = locationAvailability[name] ?? emptyAvailability(name);
    const next = { ...current, ...patch };
    const nextMap = { ...locationAvailability };
    // isEmptyAvailability only checks the shared constraint fields, not
    // the LocationAvailability-only fields (address, contact info) — so a
    // location with just those typed in and no constraints set must
    // still be kept.
    const hasLocationOnlyFields =
      next.address.trim() || next.contactName.trim() || next.contactPhone.trim() || next.contactEmail.trim();
    if (isEmptyAvailability(next) && !hasLocationOnlyFields) {
      delete nextMap[name];
    } else {
      nextMap[name] = next;
    }
    onUpdateLocationAvailability(nextMap);
  }

  function toggleLocationDay(name: string, day: number) {
    const current = locationAvailability[name] ?? emptyAvailability(name);
    const daysOfWeek = current.daysOfWeek.includes(day)
      ? current.daysOfWeek.filter((d) => d !== day)
      : [...current.daysOfWeek, day];
    patchLocationAvailability(name, { daysOfWeek });
  }

  function toggleLocationPriority(name: string) {
    const current = locationAvailability[name] ?? emptyAvailability(name);
    patchLocationAvailability(name, { priority: !current.priority });
  }

  function useShootDatesForWindow(name: string) {
    if (!shootRange) return;
    patchLocationAvailability(name, { windowStart: shootRange.start, windowEnd: shootRange.end });
  }

  function addPreferredDate(name: string) {
    const draft = newPreferredDate[name];
    if (!draft) return;
    const current = locationAvailability[name] ?? emptyAvailability(name);
    if (current.preferredDates.includes(draft)) return;
    patchLocationAvailability(name, { preferredDates: [...current.preferredDates, draft].sort() });
    setNewPreferredDate((m) => ({ ...m, [name]: "" }));
  }

  function removePreferredDate(name: string, date: string) {
    const current = locationAvailability[name] ?? emptyAvailability(name);
    patchLocationAvailability(name, { preferredDates: current.preferredDates.filter((d) => d !== date) });
  }

  // --- "Other" roster editing (rented gear, vehicles, outside vendors —
  // Other sub-tab). Manually added/removed like crew, but carries the
  // same days/window/preferred-dates/time/priority editor as a location. ---

  function patchOtherItem(id: string, patch: Partial<OtherItem>) {
    onUpdateOtherItems(otherItems.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addOtherItem() {
    if (!newOtherName.trim()) return;
    onUpdateOtherItems([
      ...otherItems,
      emptyOtherItem(newOtherId(), newOtherName.trim(), newOtherEmail.trim()),
    ]);
    setNewOtherName("");
    setNewOtherEmail("");
  }

  function removeOtherItem(id: string) {
    onUpdateOtherItems(otherItems.filter((i) => i.id !== id));
  }

  function toggleOtherDay(id: string, day: number) {
    const item = otherItems.find((i) => i.id === id);
    if (!item) return;
    const daysOfWeek = item.daysOfWeek.includes(day)
      ? item.daysOfWeek.filter((d) => d !== day)
      : [...item.daysOfWeek, day];
    patchOtherItem(id, { daysOfWeek });
  }

  function toggleOtherPriority(id: string) {
    const item = otherItems.find((i) => i.id === id);
    if (!item) return;
    patchOtherItem(id, { priority: !item.priority });
  }

  function useShootDatesForOtherWindow(id: string) {
    if (!shootRange) return;
    patchOtherItem(id, { windowStart: shootRange.start, windowEnd: shootRange.end });
  }

  function addOtherPreferredDate(id: string) {
    const draft = newOtherPreferredDate[id];
    if (!draft) return;
    const item = otherItems.find((i) => i.id === id);
    if (!item || item.preferredDates.includes(draft)) return;
    patchOtherItem(id, { preferredDates: [...item.preferredDates, draft].sort() });
    setNewOtherPreferredDate((m) => ({ ...m, [id]: "" }));
  }

  function removeOtherPreferredDate(id: string, date: string) {
    const item = otherItems.find((i) => i.id === id);
    if (!item) return;
    patchOtherItem(id, { preferredDates: item.preferredDates.filter((d) => d !== date) });
  }

  // Every check here is against real, already-gathered data — never a
  // guess — so a "flag" always points at something genuinely misaligned.
  const conflicts: Conflict[] = [];

  if (schedule.calendar_error) {
    conflicts.push({ key: "calendar_error", message: schedule.calendar_error });
  }

  for (const day of datedDays) {
    const castOnDay = castNamesForDay(day, breakdown);
    for (const name of castOnDay) {
      if (!castEmails[name]) {
        conflicts.push({
          key: `no-email-${day.day_number}-${name}`,
          message: `${name} is scheduled on Day ${day.day_number} (${day.date}) but has no email on file — they won't receive a calendar invite.`,
        });
      }
    }
  }

  // Crew is assumed needed every dated day (unlike cast, who only work
  // the days their character is in a scene) — same missing-email and
  // still-booked checks, just without scene-matching.
  for (const day of datedDays) {
    for (const member of crew) {
      if (!member.email) {
        conflicts.push({
          key: `no-email-crew-${day.day_number}-${member.id}`,
          message: `${member.name} (crew) is needed on Day ${day.day_number} (${day.date}) but has no email on file — they won't receive a calendar invite.`,
        });
      }
    }
  }

  for (const c of cancellations) {
    const day = schedule.shoot_days.find((d) => d.day_number === c.day_number);
    if (!day) continue;
    if (castNamesForDay(day, breakdown).includes(c.actor_name)) {
      conflicts.push({
        key: `cancelled-${c.actor_name}-${c.day_number}`,
        message: `${c.actor_name} marked Day ${c.day_number} unavailable, but the schedule still has them booked that day.`,
        rescheduleText: `${c.actor_name} is no longer available on Day ${c.day_number} — please reschedule around this.`,
      });
    } else if (crew.some((m) => m.name === c.actor_name)) {
      conflicts.push({
        key: `cancelled-crew-${c.actor_name}-${c.day_number}`,
        message: `${c.actor_name} (crew) marked Day ${c.day_number} unavailable, but crew is assumed needed every shoot day.`,
        rescheduleText: `${c.actor_name} (crew) is no longer available on Day ${c.day_number} — please reschedule around this.`,
      });
    }
  }

  // Real day-of-week/window arithmetic against each dated day's actual
  // locations — never an LLM guess. A hit here means the schedule is
  // pointing at a day the location genuinely isn't available.
  const takenDates = new Set(schedule.shoot_days.map((d) => d.date).filter(Boolean));
  for (const day of datedDays) {
    for (const locName of day.locations) {
      const avail = locationAvailability[locName];
      if (!avail) continue;
      const problem = checkAvailability(day.date, locName, avail);
      if (!problem) continue;
      const suggestion = findNextAllowedDate(day.date, avail, takenDates);
      conflicts.push({
        key: `location-${day.day_number}-${locName}`,
        message: `Day ${day.day_number}: ${problem}`,
        rescheduleText: suggestion
          ? `MOVE_DATE: day=${day.day_number} date=${suggestion} — ${locName} isn't available on ${day.date} (${describeAvailability(
              avail
            )}); moving to the next date it allows.`
          : undefined,
        priority: avail.priority,
      });
    }
  }

  // "Other" items (rented gear, vehicles, vendors) are assumed needed
  // every dated shoot day, same assumption as crew — same real
  // date-arithmetic check as locations, just against the item's own
  // availability window instead of a location's.
  for (const day of datedDays) {
    for (const item of otherItems) {
      const problem = checkAvailability(day.date, item.name, item);
      if (!problem) continue;
      const suggestion = findNextAllowedDate(day.date, item, takenDates);
      conflicts.push({
        key: `other-${day.day_number}-${item.id}`,
        message: `Day ${day.day_number}: ${problem}`,
        rescheduleText: suggestion
          ? `MOVE_DATE: day=${day.day_number} date=${suggestion} — ${item.name} isn't available on ${day.date} (${describeAvailability(
              item
            )}); moving to the next date it allows.`
          : undefined,
        priority: item.priority,
      });
    }
  }

  // Priority-flagged locations/items surface first — a stable sort, so
  // everything else keeps its original order.
  conflicts.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));

  return (
    <div>
      <StageHeader
        index={7}
        title="Planning"
        description="Send cast and crew an availability request before any date is locked in, and set each location's real constraints — days, dates, and priority. Once you're happy with a date, set it in the Dates tab."
      />

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <div className="tracked mb-1 text-[10px] text-faint uppercase">Proposed Shooting Period</div>
        <p className="mb-3 text-xs text-faint">
          A soft target window — shown to cast/crew in their outreach so their availability
          answers have real context, and used to default new location availability windows. This
          isn&apos;t the final schedule; set the real dates on the Dates tab once responses come
          in.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-faint">Start</span>
            <input
              type="date"
              value={proposedPeriod?.start ?? ""}
              onChange={(e) =>
                onUpdateProposedPeriod(
                  e.target.value
                    ? { start: e.target.value, end: proposedPeriod?.end ?? e.target.value }
                    : null
                )
              }
              className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-faint">End</span>
            <input
              type="date"
              value={proposedPeriod?.end ?? ""}
              onChange={(e) =>
                onUpdateProposedPeriod(
                  e.target.value
                    ? { start: proposedPeriod?.start ?? e.target.value, end: e.target.value }
                    : null
                )
              }
              className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            />
          </label>
          {proposedPeriod && (
            <button
              onClick={() => onUpdateProposedPeriod(null)}
              className="tracked text-[10px] text-faint uppercase transition hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`tracked rounded-full border px-4 py-1.5 text-xs uppercase transition ${
              subTab === t.key
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-edge text-faint hover:text-dim"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "other" && (
        <>
          <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <div className="tracked mb-1 text-[10px] text-faint uppercase">
              Other — Rented Gear, Vehicles &amp; Vendors
            </div>
            <p className="mb-3 text-xs text-faint">
              Anything you're renting or borrowing that has its own availability — a camera
              package, a grip truck, a prop house. Same editor as Location: days of week, a date
              window, preferred dates, an optional preferred time, and priority.
            </p>
            {otherItems.length > 0 && (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {otherItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${
                      item.priority ? "border-accent/50 bg-accent/5" : "border-edge/60 bg-panel2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={item.name}
                        onChange={(e) => patchOtherItem(item.id, { name: e.target.value })}
                        placeholder="Item / vendor name"
                        className="flex-1 rounded-md border border-edge bg-panel px-2 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none"
                      />
                      <button
                        onClick={() => toggleOtherPriority(item.id)}
                        className={`tracked shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                          item.priority
                            ? "border-accent/50 bg-accent/20 text-accent"
                            : "border-edge text-faint hover:text-dim"
                        }`}
                      >
                        Priority: {item.priority ? "Yes" : "No"}
                      </button>
                    </div>
                    <input
                      type="email"
                      value={item.email}
                      onChange={(e) => patchOtherItem(item.id, { email: e.target.value })}
                      placeholder="contact@vendor.com"
                      className="mt-2 w-full rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                    />

                    <div className="mt-2 flex flex-wrap gap-1">
                      {DISPLAY_ORDER.map((day) => {
                        const on = item.daysOfWeek.includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() => toggleOtherDay(item.id, day)}
                            className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                              on
                                ? "border-accent/50 bg-accent/20 text-accent"
                                : "border-edge text-faint hover:text-dim"
                            }`}
                          >
                            {DAY_LABELS[day]}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-faint">
                      {item.daysOfWeek.length === 0
                        ? "Available any day of the week"
                        : "Tap days this is available on"}
                    </p>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Window start</span>
                        <input
                          type="date"
                          value={item.windowStart}
                          onChange={(e) => patchOtherItem(item.id, { windowStart: e.target.value })}
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Window end</span>
                        <input
                          type="date"
                          value={item.windowEnd}
                          onChange={(e) => patchOtherItem(item.id, { windowEnd: e.target.value })}
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      {shootRange && (
                        <button
                          onClick={() => useShootDatesForOtherWindow(item.id)}
                          className="tracked rounded-full border border-edge px-2 py-1 text-[9px] uppercase text-faint transition hover:text-accent"
                        >
                          Use shoot dates ({shootRange.start} – {shootRange.end})
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Preferred time from</span>
                        <input
                          type="time"
                          value={item.timeStart}
                          onChange={(e) => patchOtherItem(item.id, { timeStart: e.target.value })}
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">to</span>
                        <input
                          type="time"
                          value={item.timeEnd}
                          onChange={(e) => patchOtherItem(item.id, { timeEnd: e.target.value })}
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-2">
                      <span className="text-[10px] text-faint">Preferred dates</span>
                      {item.preferredDates.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.preferredDates.map((d) => (
                            <button
                              key={d}
                              onClick={() => removeOtherPreferredDate(item.id, d)}
                              title="Remove"
                              className="tracked rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] uppercase text-accent transition hover:bg-red-500/10 hover:text-red-300"
                            >
                              {d} ×
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="date"
                          value={newOtherPreferredDate[item.id] ?? ""}
                          onChange={(e) =>
                            setNewOtherPreferredDate((m) => ({ ...m, [item.id]: e.target.value }))
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                        <button
                          onClick={() => addOtherPreferredDate(item.id)}
                          disabled={!newOtherPreferredDate[item.id]}
                          className="tracked rounded-full border border-edge px-2 py-1 text-[9px] uppercase text-faint transition hover:text-accent disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <input
                      placeholder="Notes (e.g. pickup by 9am, return same day)"
                      value={item.notes}
                      onChange={(e) => patchOtherItem(item.id, { notes: e.target.value })}
                      className="mt-2 w-full rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                    />

                    <button
                      onClick={() => removeOtherItem(item.id)}
                      className="tracked mt-2 text-[9px] text-faint uppercase transition hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Item / vendor name</span>
                <input
                  value={newOtherName}
                  onChange={(e) => setNewOtherName(e.target.value)}
                  placeholder="RED camera package"
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Contact email</span>
                <input
                  type="email"
                  value={newOtherEmail}
                  onChange={(e) => setNewOtherEmail(e.target.value)}
                  placeholder="contact@vendor.com"
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <button
                onClick={addOtherItem}
                disabled={!newOtherName.trim()}
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
              >
                Add item
              </button>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="tracked text-[10px] text-faint uppercase">
                Conflicts {conflicts.length > 0 && `(${conflicts.length})`}
              </div>
              <button
                onClick={checkResponses}
                disabled={checking}
                className="tracked text-[10px] text-faint uppercase transition hover:text-dim"
              >
                {checking ? "Checking..." : "↻ Recheck"}
              </button>
            </div>
            {conflicts.length === 0 ? (
              <p className="text-xs text-faint">Nothing flagged — cast/crew emails and dates line up.</p>
            ) : (
              <div className="space-y-2">
                {conflicts.map((c) => (
                  <div
                    key={c.key}
                    className={`flex items-center justify-between gap-4 rounded-md border-l-2 px-4 py-3 text-sm ${
                      c.priority
                        ? "border-amber/60 bg-amber/10 text-amber"
                        : "border-red-500/60 bg-red-500/10 text-red-200"
                    }`}
                  >
                    <span>
                      {c.priority ? "★ " : "⚠ "}
                      {c.message}
                    </span>
                    {c.rescheduleText && (
                      <button
                        onClick={() => onRequestReschedule(c.rescheduleText!)}
                        className="shrink-0 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 transition hover:bg-red-500/30"
                      >
                        Draft reschedule request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-edge bg-panel p-4">
            <div className="tracked mb-3 text-[10px] text-faint uppercase">
              Alternative Date Suggestions
            </div>
            {suggestions.length === 0 ? (
              <p className="text-xs text-faint">
                No responses yet — once cast/crew submit availability, the best overlapping date
                per day will show up here.
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div
                    key={s.day_number}
                    className="flex items-center justify-between gap-4 rounded-md border-l-2 border-accent/60 bg-accent/10 px-4 py-3 text-sm text-ink"
                  >
                    <span>
                      Day {s.day_number}: best overlap is <strong>{s.best_date}</strong>
                      {s.in_proposed_period === false && (
                        <span className="text-amber"> (outside your proposed period)</span>
                      )}{" "}
                      — covers {s.priority_covered > 0 && `${s.priority_covered} priority, `}
                      {s.cast_covered} cast + {s.crew_covered} crew (of {s.total_proposers} people
                      who submitted availability): {s.covered_names.join(", ")}.
                    </span>
                    <button
                      onClick={() =>
                        onRequestReschedule(
                          `MOVE_DATE: day=${s.day_number} date=${s.best_date} — this date works for ${s.covered_names.join(
                            ", "
                          )}, based on their submitted availability for Day ${s.day_number}${
                            s.priority_covered > 0 ? " (prioritizing flagged priority people)" : ""
                          }.`
                        )
                      }
                      className="shrink-0 rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition hover:bg-accent/30"
                    >
                      Use this date
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {subTab === "location" && (
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="tracked mb-1 text-[10px] text-faint uppercase">Location Availability</div>
          <p className="mb-3 text-xs text-faint">
            Some locations are only usable on certain days, or only for a limited window (a venue
            booked for one week, an owner who only allows weekday mornings, etc.). Flag a location
            as priority if its constraint should win over others and be surfaced first in
            Conflicts.
          </p>
          {breakdown.locations.length === 0 ? (
            <p className="text-xs text-faint">No locations in the breakdown yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {breakdown.locations.map((loc) => {
                const avail = locationAvailability[loc.name] ?? emptyAvailability(loc.name);
                const constrained = !isEmptyAvailability(avail);
                return (
                  <div
                    key={loc.name}
                    className={`rounded-lg border p-3 ${
                      constrained ? "border-accent/50 bg-accent/5" : "border-edge/60 bg-panel2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink">{loc.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="tracked text-[9px] text-faint uppercase">
                          {loc.int_ext} · {loc.scene_count} scene(s)
                        </span>
                        <button
                          onClick={() => toggleLocationPriority(loc.name)}
                          className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                            avail.priority
                              ? "border-accent/50 bg-accent/20 text-accent"
                              : "border-edge text-faint hover:text-dim"
                          }`}
                        >
                          Priority: {avail.priority ? "Yes" : "No"}
                        </button>
                      </div>
                    </div>

                    <label className="mt-2 flex flex-col gap-1">
                      <span className="text-[10px] text-faint">
                        Address / GPS / cross streets (shown on the call sheet)
                      </span>
                      <input
                        type="text"
                        value={avail.address}
                        onChange={(e) =>
                          patchLocationAvailability(loc.name, { address: e.target.value })
                        }
                        placeholder="e.g. 214 Barton Springs Rd, Austin, TX"
                        className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                      />
                    </label>

                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Location contact — name</span>
                        <input
                          type="text"
                          value={avail.contactName}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { contactName: e.target.value })
                          }
                          placeholder="Owner / manager"
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Phone</span>
                        <input
                          type="text"
                          value={avail.contactPhone}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { contactPhone: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Email</span>
                        <input
                          type="email"
                          value={avail.contactEmail}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { contactEmail: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {DISPLAY_ORDER.map((day) => {
                        const on = avail.daysOfWeek.includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() => toggleLocationDay(loc.name, day)}
                            className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                              on
                                ? "border-accent/50 bg-accent/20 text-accent"
                                : "border-edge text-faint hover:text-dim"
                            }`}
                          >
                            {DAY_LABELS[day]}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-faint">
                      {avail.daysOfWeek.length === 0
                        ? "Available any day of the week"
                        : "Tap days this location is available on"}
                    </p>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Window start</span>
                        <input
                          type="date"
                          value={avail.windowStart}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { windowStart: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Window end</span>
                        <input
                          type="date"
                          value={avail.windowEnd}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { windowEnd: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      {shootRange && (
                        <button
                          onClick={() => useShootDatesForWindow(loc.name)}
                          className="tracked rounded-full border border-edge px-2 py-1 text-[9px] uppercase text-faint transition hover:text-accent"
                        >
                          Use shoot dates ({shootRange.start} – {shootRange.end})
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">Preferred time from</span>
                        <input
                          type="time"
                          value={avail.timeStart}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { timeStart: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-faint">to</span>
                        <input
                          type="time"
                          value={avail.timeEnd}
                          onChange={(e) =>
                            patchLocationAvailability(loc.name, { timeEnd: e.target.value })
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                    </div>
                    <p className="mt-1 text-[10px] text-faint">
                      Informational only — shoot days don&apos;t carry a call time yet, so this
                      isn&apos;t enforced, just shown alongside the day.
                    </p>

                    <div className="mt-2">
                      <span className="text-[10px] text-faint">Preferred dates</span>
                      {avail.preferredDates.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {avail.preferredDates.map((d) => (
                            <button
                              key={d}
                              onClick={() => removePreferredDate(loc.name, d)}
                              title="Remove"
                              className="tracked rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] uppercase text-accent transition hover:bg-red-500/10 hover:text-red-300"
                            >
                              {d} ×
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="date"
                          value={newPreferredDate[loc.name] ?? ""}
                          onChange={(e) =>
                            setNewPreferredDate((m) => ({ ...m, [loc.name]: e.target.value }))
                          }
                          className="rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                        />
                        <button
                          onClick={() => addPreferredDate(loc.name)}
                          disabled={!newPreferredDate[loc.name]}
                          className="tracked rounded-full border border-edge px-2 py-1 text-[9px] uppercase text-faint transition hover:text-accent disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <input
                      placeholder="Notes (e.g. owner only allows weekday mornings)"
                      value={avail.notes}
                      onChange={(e) => patchLocationAvailability(loc.name, { notes: e.target.value })}
                      className="mt-2 w-full rounded-md border border-edge bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                    />

                    {constrained && (
                      <button
                        onClick={() => {
                          const nextMap = { ...locationAvailability };
                          delete nextMap[loc.name];
                          onUpdateLocationAvailability(nextMap);
                        }}
                        className="tracked mt-2 text-[9px] text-faint uppercase transition hover:text-red-300"
                      >
                        Clear constraint
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "actors" && (
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="tracked mb-3 text-[10px] text-faint uppercase">Cast Availability</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {breakdown.cast.map((member) => {
              const daysOn = schedule.shoot_days
                .filter((d) => castNamesForDay(d, breakdown).includes(member.name))
                .map((d) => d.day_number);
              const confirmedCount = confirmations.filter(
                (c) => c.actor_name === member.name && daysOn.includes(c.day_number)
              ).length;
              const cancelledCount = cancellations.filter(
                (c) => c.actor_name === member.name && daysOn.includes(c.day_number)
              ).length;
              const token = availabilityLinks[member.name];
              const isPriority = !!castPriority[member.name];
              return (
                <div
                  key={member.name}
                  className={`rounded-lg border p-3 ${
                    isPriority ? "border-accent/50 bg-accent/5" : "border-edge/60 bg-panel2"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">{member.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tracked text-[9px] text-faint uppercase">{member.role_size}</span>
                      <button
                        onClick={() => toggleCastPriority(member.name)}
                        className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                          isPriority
                            ? "border-accent/50 bg-accent/20 text-accent"
                            : "border-edge text-faint hover:text-dim"
                        }`}
                      >
                        Priority: {isPriority ? "Yes" : "No"}
                      </button>
                    </div>
                  </div>
                  <input
                    type="email"
                    placeholder="actor@example.com"
                    value={castEmails[member.name] ?? ""}
                    onChange={(e) => setCastEmail(member.name, e.target.value)}
                    className="mt-2 w-full rounded-md border border-edge bg-panel px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className="text-faint">
                      {daysOn.length} day(s) ·{" "}
                      {confirmedCount > 0 && <span className="text-accent">{confirmedCount} confirmed</span>}
                      {confirmedCount > 0 && cancelledCount > 0 && " · "}
                      {cancelledCount > 0 && <span className="text-red-300">{cancelledCount} cancelled</span>}
                      {confirmedCount === 0 && cancelledCount === 0 && "no response yet"}
                    </span>
                    {token ? (
                      <a
                        href={`/availability/${token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tracked text-accent uppercase transition hover:brightness-125"
                      >
                        Open link →
                      </a>
                    ) : (
                      <span className="tracked text-faint uppercase">No link yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-faint">
            Cast outreach emails (with links) are generated on the Availability tab — the links
            show up here automatically once sent.
          </p>
        </div>
      )}

      {subTab === "crew" && (
        <>
          <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <div className="tracked mb-3 text-[10px] text-faint uppercase">Crew Roster</div>
            {crew.length > 0 && (
              <div className="mb-3 space-y-2">
                {crew.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                      c.priority ? "border-accent/50 bg-accent/5" : "border-edge/60 bg-panel2"
                    }`}
                  >
                    <div className="text-xs text-ink">
                      <span className="font-medium">{c.name}</span>
                      {c.role && <span className="text-dim"> · {c.role}</span>}
                      <span className="text-faint"> · {c.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCrewPriority(c.id)}
                        className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                          c.priority
                            ? "border-accent/50 bg-accent/20 text-accent"
                            : "border-edge text-faint hover:text-dim"
                        }`}
                      >
                        Priority: {c.priority ? "Yes" : "No"}
                      </button>
                      <button
                        onClick={() => removeCrewMember(c.id)}
                        className="tracked text-[10px] text-faint uppercase transition hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Name</span>
                <input
                  value={newCrewName}
                  onChange={(e) => setNewCrewName(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Role</span>
                <input
                  placeholder="Gaffer, DP, Sound..."
                  value={newCrewRole}
                  onChange={(e) => setNewCrewRole(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Email</span>
                <input
                  type="email"
                  placeholder="crew@example.com"
                  value={newCrewEmail}
                  onChange={(e) => setNewCrewEmail(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <button
                onClick={addCrewMember}
                disabled={!newCrewName.trim() || !newCrewEmail.trim()}
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
              >
                Add crew member
              </button>
            </div>
          </div>

          {crew.length > 0 && (
            <div className="rounded-xl border border-edge bg-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="tracked text-[10px] text-faint uppercase">Crew Availability</div>
                <button
                  onClick={sendCrewLinks}
                  disabled={sendingCrewLinks}
                  className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
                >
                  {sendingCrewLinks ? "Generating..." : "↻ Generate links"}
                </button>
              </div>
              <p className="mb-3 text-xs text-faint">
                Crew is assumed needed every shoot day. Generate a link per person, then copy the
                draft below — it asks for 3+ available dates on any day that isn&apos;t dated yet.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {crew.map((c) => {
                  const token = availabilityLinks[c.name];
                  return (
                    <div key={c.id} className="rounded-lg border border-edge/60 bg-panel2 p-3">
                      <div className="text-xs font-medium text-ink">
                        {c.name}
                        {c.role && <span className="text-dim"> · {c.role}</span>}
                        {c.priority && <span className="text-accent"> · priority</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => copyCrewEmail(c)}
                          className="tracked text-[10px] text-faint uppercase transition hover:text-accent"
                        >
                          {copiedCrewId === c.id ? "Copied!" : "Copy email"}
                        </button>
                        {token ? (
                          <a
                            href={`/availability/${token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="tracked text-[10px] text-accent uppercase transition hover:brightness-125"
                          >
                            Open crew link →
                          </a>
                        ) : (
                          <span className="tracked text-[10px] text-faint uppercase">
                            Generate links first
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
