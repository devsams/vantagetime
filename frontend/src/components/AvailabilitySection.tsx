"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import NoteBullets from "./NoteBullets";
import { castNamesForDay } from "@/lib/calendar";
import {
  describeAvailability,
  emptyAvailability,
  isLocationReviewed,
  locationsInUse,
} from "@/lib/locationAvailability";
import { friendlyDate, friendlyDateWithYear } from "@/lib/text";
import {
  fetchCancellations,
  fetchConfirmations,
  fetchDateWindow,
  fetchProposals,
} from "@/lib/api";
import {
  Breakdown,
  Cancellation,
  Confirmation,
  CrewMember,
  DateProposal,
  DateWindow,
  LocationAvailability,
  LocationResearch,
  OtherItem,
  Schedule,
} from "@/lib/types";

function blockLabel(block: string[]): string {
  if (block.length === 0) return "";
  const year = block[0].slice(0, 4);
  if (block.length === 1) return `${friendlyDate(block[0])}, ${year}`;
  return `${friendlyDate(block[0])} – ${friendlyDate(block[block.length - 1])}, ${year}`;
}

// --- Response status (folded in from the old standalone "Status" tab) ---

type StatusKey = "unavailable" | "pending" | "awaiting_dates" | "locked_in" | "no_days";

const STATUS_LABEL: Record<StatusKey, string> = {
  unavailable: "Unavailable",
  pending: "Pending",
  awaiting_dates: "Awaiting dates",
  locked_in: "Locked in",
  no_days: "Not scheduled",
};

const STATUS_STYLE: Record<StatusKey, string> = {
  unavailable: "border-coral/50 bg-coral/10 text-coral",
  pending: "border-edge bg-panel2 text-dim",
  awaiting_dates: "border-amber/50 bg-amber/10 text-amber",
  locked_in: "border-accent/50 bg-accent/15 text-accent",
  no_days: "border-edge bg-panel2 text-faint",
};

interface StatusRow {
  key: string;
  name: string;
  type: "Cast" | "Crew";
  priority: boolean;
  status: StatusKey;
  detail: string;
}

/** Real cross-referencing against cancellations/proposals/confirmations
 * already gathered from the actor-facing pages — never a guess about
 * who's ready. A person is only "locked in" once every day they're
 * needed on is both dated AND explicitly confirmed. */
function computeStatus(
  name: string,
  daysOn: { day_number: number; date: string }[],
  cancellations: Cancellation[],
  confirmations: Confirmation[],
  proposals: DateProposal[]
): { status: StatusKey; detail: string } {
  if (daysOn.length === 0) return { status: "no_days", detail: "Not scheduled on any day" };

  const cancelledDays = daysOn.filter((d) =>
    cancellations.some((c) => c.actor_name === name && c.day_number === d.day_number)
  );
  if (cancelledDays.length > 0) {
    return {
      status: "unavailable",
      detail: `Flagged unavailable: Day ${cancelledDays.map((d) => d.day_number).join(", ")}`,
    };
  }

  const datedDays = daysOn.filter((d) => d.date);
  const undatedDays = daysOn.filter((d) => !d.date);

  const unconfirmedDated = datedDays.filter(
    (d) => !confirmations.some((c) => c.actor_name === name && c.day_number === d.day_number)
  );
  const unrespondedUndated = undatedDays.filter(
    (d) => !proposals.some((p) => p.actor_name === name && p.day_number === d.day_number)
  );

  if (unconfirmedDated.length > 0 || unrespondedUndated.length > 0) {
    const waiting = unconfirmedDated.length + unrespondedUndated.length;
    return { status: "pending", detail: `No response yet on ${waiting} of ${daysOn.length} day(s)` };
  }

  if (undatedDays.length > 0) {
    return { status: "awaiting_dates", detail: "Submitted availability — waiting on final dates" };
  }

  return { status: "locked_in", detail: "Confirmed on every scheduled day" };
}

interface DayCoverage {
  day_number: number;
  date: string;
  locations: string[];
  weather_flag: string;
  sunrise: string;
  sunset: string;
  call_time_note: string;
  required: number;
  confirmedNames: string[];
  cancelledNames: string[];
  pendingNames: string[];
  proposedNames: string[]; // undated days only — people who submitted alternate dates
}

type PersonDayState = "confirmed" | "cancelled" | "proposed" | "pending";

interface PersonDay {
  day_number: number;
  date: string;
  state: PersonDayState;
  proposedDates: string[];
}

interface PersonRow {
  key: string;
  name: string;
  type: "Cast" | "Crew" | "Other";
  roleLabel: string;
  priority: boolean;
  email: string;
  hasLink: boolean;
  days: PersonDay[];
  availabilityNote: string;
}

const DAY_STATE_STYLE: Record<PersonDayState, string> = {
  confirmed: "border-mint/50 bg-mint/10 text-mint",
  cancelled: "border-coral/50 bg-coral/10 text-coral",
  proposed: "border-blue/50 bg-blue/10 text-blue",
  pending: "border-edge bg-panel2 text-faint",
};

const DAY_STATE_LABEL: Record<PersonDayState, string> = {
  confirmed: "Confirmed",
  cancelled: "Unavailable",
  proposed: "Proposed dates",
  pending: "No response",
};

function personDayState(
  name: string,
  day: { day_number: number; date: string },
  cancellations: Cancellation[],
  confirmations: Confirmation[],
  proposals: DateProposal[]
): PersonDay {
  const cancelled = cancellations.some((c) => c.actor_name === name && c.day_number === day.day_number);
  if (cancelled) return { day_number: day.day_number, date: day.date, state: "cancelled", proposedDates: [] };

  const confirmed = confirmations.some((c) => c.actor_name === name && c.day_number === day.day_number);
  if (confirmed && day.date) {
    return { day_number: day.day_number, date: day.date, state: "confirmed", proposedDates: [] };
  }

  const proposal = proposals
    .filter((p) => p.actor_name === name && p.day_number === day.day_number)
    .sort((a, b) => b.submitted_at - a.submitted_at)[0];
  if (proposal) {
    return { day_number: day.day_number, date: day.date, state: "proposed", proposedDates: proposal.dates };
  }

  return { day_number: day.day_number, date: day.date, state: "pending", proposedDates: [] };
}

/** The final, printable production report — real dates, real names,
 * real per-location weather/permit facts, not just aggregate counts.
 * For quick triage of who specifically hasn't responded, the Status tab
 * is still faster; this is the version meant to be handed to the
 * production office or printed and taped to a wall. */
export default function AvailabilitySection({
  sessionId,
  projectName,
  breakdown,
  schedule,
  crew,
  otherItems,
  castEmails,
  castPriority,
  castAvailabilityNote,
  availabilityLinks,
  locationAvailability,
  locationResearch,
}: {
  sessionId: string;
  projectName: string;
  breakdown: Breakdown;
  schedule: Schedule;
  crew: CrewMember[];
  otherItems: OtherItem[];
  castEmails: Record<string, string>;
  castPriority: Record<string, boolean>;
  castAvailabilityNote: Record<string, string>;
  availabilityLinks: Record<string, string>;
  locationAvailability: Record<string, LocationAvailability>;
  locationResearch: Record<number, LocationResearch>;
}) {
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [proposals, setProposals] = useState<DateProposal[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [dateWindow, setDateWindow] = useState<DateWindow | null>(null);
  const [checking, setChecking] = useState(false);

  async function refresh() {
    setChecking(true);
    const [cancellationResult, proposalResult, confirmationResult, windowResult] = await Promise.all([
      fetchCancellations(sessionId),
      fetchProposals(sessionId),
      fetchConfirmations(sessionId),
      fetchDateWindow(sessionId),
    ]);
    setCancellations(cancellationResult);
    setProposals(proposalResult);
    setConfirmations(confirmationResult);
    setDateWindow(windowResult);
    setChecking(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function researchFor(name: string): LocationResearch | undefined {
    return Object.values(locationResearch).find(
      (r) => r.assigned && !r.research_blocked && r.location_name === name
    );
  }

  const castNames = breakdown.cast.map((c) => c.name);
  const allNames = [...castNames, ...crew.map((c) => c.name), ...otherItems.map((o) => o.name)];
  const totalLinked = allNames.filter((n) => availabilityLinks[n]).length;
  const emailByName: Record<string, string> = {
    ...castEmails,
    ...Object.fromEntries(crew.map((c) => [c.name, c.email])),
    ...Object.fromEntries(otherItems.map((o) => [o.name, o.email])),
  };
  const noEmailCount = allNames.filter((n) => !emailByName[n]).length;

  const priorityNames = [
    ...breakdown.cast.filter((c) => castPriority[c.name]).map((c) => c.name),
    ...crew.filter((c) => c.priority).map((c) => c.name),
    ...otherItems.filter((o) => o.priority).map((o) => o.name),
  ];

  // --- Per-person real day-by-day detail (real dates, real names) ---
  const people: PersonRow[] = [
    ...breakdown.cast.map((c) => ({
      key: `cast-${c.name}`,
      name: c.name,
      type: "Cast" as const,
      roleLabel: c.role_size,
      priority: !!castPriority[c.name],
      email: castEmails[c.name] ?? "",
      daysOn: schedule.shoot_days.filter((d) => castNamesForDay(d, breakdown).includes(c.name)),
      availabilityNote: castAvailabilityNote[c.name] ?? "",
    })),
    ...crew.map((c) => ({
      key: `crew-${c.id}`,
      name: c.name,
      type: "Crew" as const,
      roleLabel: c.role || "Crew",
      priority: c.priority,
      email: c.email,
      daysOn: schedule.shoot_days,
      availabilityNote: c.availabilityNote ?? "",
    })),
    ...otherItems.map((o) => ({
      key: `other-${o.id}`,
      name: o.name,
      type: "Other" as const,
      roleLabel: "Rental / vendor",
      priority: o.priority,
      email: o.email,
      daysOn: schedule.shoot_days,
      // "Other" items already carry a real AvailabilityConstraint (days/
      // window/preferred dates), unlike cast/crew — reuse its own
      // description instead of a free-text note.
      availabilityNote: describeAvailability(o),
    })),
  ].map((p) => ({
    key: p.key,
    name: p.name,
    type: p.type,
    roleLabel: p.roleLabel,
    priority: p.priority,
    email: p.email,
    hasLink: !!availabilityLinks[p.name],
    days: p.daysOn.map((d) => personDayState(p.name, d, cancellations, confirmations, proposals)),
    availabilityNote: p.availabilityNote,
  }));

  people.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // --- Response status: one row per cast/crew member, for quick triage
  // of who hasn't responded (folded in from the old Status tab). ---
  const statusRows: StatusRow[] = [];
  for (const member of breakdown.cast) {
    const daysOn = schedule.shoot_days.filter((d) => castNamesForDay(d, breakdown).includes(member.name));
    const { status, detail } = computeStatus(member.name, daysOn, cancellations, confirmations, proposals);
    statusRows.push({
      key: `cast-${member.name}`,
      name: member.name,
      type: "Cast",
      priority: !!castPriority[member.name],
      status,
      detail,
    });
  }
  for (const member of crew) {
    const { status, detail } = computeStatus(
      member.name,
      schedule.shoot_days,
      cancellations,
      confirmations,
      proposals
    );
    statusRows.push({
      key: `crew-${member.id}`,
      name: member.name,
      type: "Crew",
      priority: member.priority,
      status,
      detail,
    });
  }
  const STATUS_RANK: Record<StatusKey, number> = {
    unavailable: 0,
    pending: 1,
    awaiting_dates: 2,
    no_days: 3,
    locked_in: 4,
  };
  statusRows.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return a.name.localeCompare(b.name);
  });
  const trackableStatus = statusRows.filter((r) => r.status !== "no_days");
  const lockedCount = trackableStatus.filter((r) => r.status === "locked_in").length;
  const unavailableStatusCount = trackableStatus.filter((r) => r.status === "unavailable").length;
  const pendingCount = trackableStatus.filter((r) => r.status === "pending").length;
  const awaitingCount = trackableStatus.filter((r) => r.status === "awaiting_dates").length;
  const allLocked = trackableStatus.length > 0 && lockedCount === trackableStatus.length;

  // --- Per-day real coverage (real names, not just counts) ---
  const coverage: DayCoverage[] = schedule.shoot_days
    .map((day) => {
      const namesOnDay = [
        ...castNamesForDay(day, breakdown),
        ...crew.map((c) => c.name),
        ...otherItems.map((o) => o.name),
      ];
      const cancelledNames = namesOnDay.filter((n) =>
        cancellations.some((c) => c.actor_name === n && c.day_number === day.day_number)
      );
      const confirmedNames = namesOnDay.filter((n) =>
        confirmations.some((c) => c.actor_name === n && c.day_number === day.day_number)
      );
      const proposedNames = namesOnDay.filter((n) =>
        proposals.some((p) => p.actor_name === n && p.day_number === day.day_number)
      );
      const pendingNames = namesOnDay.filter(
        (n) => !cancelledNames.includes(n) && !confirmedNames.includes(n)
      );
      return {
        day_number: day.day_number,
        date: day.date,
        locations: day.locations,
        weather_flag: day.weather_flag,
        sunrise: day.sunrise,
        sunset: day.sunset,
        call_time_note: day.call_time_note,
        required: namesOnDay.length,
        confirmedNames,
        cancelledNames,
        pendingNames,
        proposedNames,
      };
    })
    .sort((a, b) => a.day_number - b.day_number);

  const totalRequired = coverage.reduce((sum, d) => sum + d.required, 0);
  const totalConfirmed = coverage.reduce((sum, d) => sum + d.confirmedNames.length, 0);
  const totalCancelled = coverage.reduce((sum, d) => sum + d.cancelledNames.length, 0);
  const coveragePct = totalRequired > 0 ? Math.round((totalConfirmed / totalRequired) * 100) : 0;

  const locationsUsed = locationsInUse(breakdown, schedule);

  return (
    <div id="availability-print-area">
      <StageHeader
        index={8}
        title="Dashboard"
        description="The production home screen — who's responded and who's still pending, then the final report: real confirmed dates and names, day by day and person by person. To send or resend outreach, use the Production Plan tab's Roster sub-tab."
        action={
          <div className="no-print flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-faint transition hover:text-dim"
            >
              🖨 Print
            </button>
            <button
              onClick={refresh}
              disabled={checking}
              className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-faint transition hover:text-dim disabled:opacity-50"
            >
              {checking ? "Checking..." : "↻ Refresh"}
            </button>
          </div>
        }
      />

      <div className="mb-2 hidden text-lg font-semibold text-ink print:block">
        {projectName} — Production Availability Report
      </div>
      <div className="mb-6 hidden text-xs text-faint print:block">
        Generated {friendlyDateWithYear(new Date().toISOString().slice(0, 10))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-2xl font-semibold text-ink">
            {castNames.length + crew.length + otherItems.length}
          </div>
          <div className="tracked mt-1 text-[10px] text-faint uppercase">
            Cast / Crew / Other ({castNames.length}/{crew.length}/{otherItems.length})
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-2xl font-semibold text-ink">
            {totalLinked}
            <span className="text-sm text-faint">/{allNames.length}</span>
          </div>
          <div className="tracked mt-1 text-[10px] text-faint uppercase">Links Generated</div>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-2xl font-semibold text-accent">{coveragePct}%</div>
          <div className="tracked mt-1 text-[10px] text-faint uppercase">
            Confirmed ({totalConfirmed}/{totalRequired})
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className={`text-2xl font-semibold ${totalCancelled > 0 ? "text-coral" : "text-ink"}`}>
            {totalCancelled}
          </div>
          <div className="tracked mt-1 text-[10px] text-faint uppercase">Flagged Unavailable</div>
        </div>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className={`text-2xl font-semibold ${noEmailCount > 0 ? "text-amber" : "text-ink"}`}>
            {noEmailCount}
          </div>
          <div className="tracked mt-1 text-[10px] text-faint uppercase">No Email On File</div>
        </div>
      </div>

      {/* --- Response status: quick triage of who hasn't responded --- */}
      <div className="mb-6">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Response Status</div>
        <div
          className={`mb-3 rounded-xl border p-4 text-sm ${
            allLocked
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-amber/50 bg-amber/10 text-amber"
          }`}
        >
          {allLocked
            ? `✓ Everything is locked in — ${lockedCount} of ${trackableStatus.length} people confirmed on every scheduled day.`
            : `Not locked in yet — ${lockedCount} locked in, ${pendingCount} pending, ${awaitingCount} awaiting final dates, ${unavailableStatusCount} unavailable (of ${trackableStatus.length}).`}
        </div>
        {statusRows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-edge text-[10px] uppercase tracked text-faint">
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((r) => (
                  <tr key={r.key} className="border-b border-edge/60 last:border-0">
                    <td className="px-4 py-3 text-ink">
                      {r.name}
                      {r.priority && <span className="text-accent"> ★</span>}
                    </td>
                    <td className="px-4 py-3 text-dim">{r.type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`tracked inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status]}`}
                        title={r.detail}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                      <div className="mt-1 text-[10px] text-faint">{r.detail}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <div className="tracked mb-2 text-[10px] text-faint uppercase">Shoot Window</div>
        {!dateWindow ? (
          <p className="text-xs text-faint">No candidate window set yet — see the Production Plan tab.</p>
        ) : dateWindow.locked_block ? (
          <p className="text-sm text-accent">Locked: {blockLabel(dateWindow.locked_block)}</p>
        ) : (
          <p className="text-xs text-faint">
            {dateWindow.candidate_blocks.length} candidate block(s) proposed, none locked yet.
          </p>
        )}
        {priorityNames.length > 0 && (
          <p className="mt-2 text-[11px] text-faint">Priority: {priorityNames.join(", ")}</p>
        )}
      </div>

      {/* --- Day by day: real names, real weather, real call notes --- */}
      <div className="mb-6">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Day-by-Day Detail</div>
        {coverage.length === 0 ? (
          <p className="text-xs text-faint">No shoot days yet.</p>
        ) : (
          <div className="space-y-3">
            {coverage.map((d) => {
              const confirmedPct = d.required > 0 ? (d.confirmedNames.length / d.required) * 100 : 0;
              const cancelledPct = d.required > 0 ? (d.cancelledNames.length / d.required) * 100 : 0;
              return (
                <div
                  key={d.day_number}
                  className="break-inside-avoid rounded-xl border border-edge bg-panel p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-ink">Day {d.day_number}</span>
                      <span className="ml-2 text-xs text-faint">
                        {d.date ? friendlyDate(d.date) : "date not locked yet"}
                      </span>
                    </div>
                    {d.locations.length > 0 && (
                      <span className="text-[11px] text-faint">{d.locations.join(", ")}</span>
                    )}
                  </div>

                  {(d.weather_flag || d.sunrise || d.sunset) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
                      {d.weather_flag && (
                        <span className="rounded-full border border-blue/40 bg-blue/10 px-2 py-0.5 text-blue">
                          {d.weather_flag}
                        </span>
                      )}
                      {d.sunrise && <span>☀ Sunrise {d.sunrise}</span>}
                      {d.sunset && <span>🌙 Sunset {d.sunset}</span>}
                    </div>
                  )}

                  {d.call_time_note && (
                    <p className="mt-2 text-[11px] text-amber">{d.call_time_note}</p>
                  )}

                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-panel2">
                    <div
                      className="h-full bg-mint"
                      style={{
                        width: `${d.date ? confirmedPct : d.required > 0 ? (d.proposedNames.length / d.required) * 100 : 0}%`,
                      }}
                    />
                    <div className="h-full bg-coral/60" style={{ width: `${cancelledPct}%` }} />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                    <div>
                      <span className="tracked text-[9px] text-mint uppercase">
                        Confirmed ({d.confirmedNames.length})
                      </span>
                      <p className="mt-0.5 text-dim">{d.confirmedNames.join(", ") || "—"}</p>
                    </div>
                    <div>
                      <span className="tracked text-[9px] text-faint uppercase">
                        {d.date ? `Pending (${d.pendingNames.length})` : `Submitted dates (${d.proposedNames.length})`}
                      </span>
                      <p className="mt-0.5 text-dim">
                        {(d.date ? d.pendingNames : d.proposedNames).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="tracked text-[9px] text-coral uppercase">
                        Unavailable ({d.cancelledNames.length})
                      </span>
                      <p className="mt-0.5 text-dim">{d.cancelledNames.join(", ") || "—"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Roster: every person, every day, real dates --- */}
      <div className="mb-6">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Roster Detail</div>
        {people.length === 0 ? (
          <p className="text-xs text-faint">No cast, crew, or other items to track yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-edge text-[10px] uppercase tracked text-faint">
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Type / Role</th>
                  <th className="px-4 py-3 font-normal">Contact</th>
                  <th className="px-4 py-3 font-normal">Days</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.key} className="border-b border-edge/60 align-top last:border-0">
                    <td className="px-4 py-3 text-ink">
                      {p.name}
                      {p.priority && <span className="text-accent"> ★</span>}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {p.type}
                      <div className="text-[10px] text-faint">{p.roleLabel}</div>
                      {p.availabilityNote && (
                        <div className="mt-0.5 text-[9px] text-faint" title={p.availabilityNote}>
                          {p.availabilityNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px]">
                      {p.email ? (
                        <span className="text-dim">{p.email}</span>
                      ) : (
                        <span className="text-coral">No email</span>
                      )}
                      {p.hasLink && <div className="tracked mt-0.5 text-accent uppercase">Link sent</div>}
                    </td>
                    <td className="px-4 py-3">
                      {p.days.length === 0 ? (
                        <span className="text-faint">Not scheduled</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {p.days.map((d) => (
                            <span
                              key={d.day_number}
                              title={
                                d.state === "proposed"
                                  ? `Proposed: ${d.proposedDates.join(", ")}`
                                  : DAY_STATE_LABEL[d.state]
                              }
                              className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase ${DAY_STATE_STYLE[d.state]}`}
                            >
                              D{d.day_number} · {d.date ? friendlyDate(d.date) : "TBD"} ·{" "}
                              {DAY_STATE_LABEL[d.state]}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Locations: real facts, not paragraphs --- */}
      {locationsUsed.length > 0 && (
        <div>
          <div className="tracked mb-3 text-[10px] text-faint uppercase">Locations</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {locationsUsed.map((name) => {
              const avail = locationAvailability[name];
              const research = researchFor(name);
              const reviewed = isLocationReviewed(avail ?? emptyAvailability(name));
              return (
                <div key={name} className="break-inside-avoid rounded-lg border border-edge bg-panel p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">{name}</span>
                    <span
                      className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase ${
                        reviewed ? "border-mint/50 bg-mint/10 text-mint" : "border-amber/50 bg-amber/10 text-amber"
                      }`}
                    >
                      {reviewed ? "Reviewed" : "Needs review"}
                    </span>
                  </div>
                  {avail?.address && <p className="mt-1 text-[11px] text-dim">{avail.address}</p>}
                  {avail?.contactName && (
                    <p className="mt-0.5 text-[11px] text-faint">
                      {avail.contactName}
                      {avail.contactPhone && ` · ${avail.contactPhone}`}
                    </p>
                  )}
                  {research?.hours_notes && (
                    <div className="mt-2 text-[10px] text-ink">
                      <span className="text-faint">Hours: </span>
                      <NoteBullets text={research.hours_notes} max={2} className="mt-0.5" />
                    </div>
                  )}
                  {research?.weather_notes && (
                    <div className="mt-2 text-[10px] text-dim">
                      <span className="text-faint">Weather: </span>
                      <NoteBullets text={research.weather_notes} max={3} className="mt-0.5" />
                    </div>
                  )}
                  {research?.permit_notes && (
                    <div className="mt-2 text-[10px] text-dim">
                      <span className="text-faint">Permits: </span>
                      <NoteBullets text={research.permit_notes} max={3} className="mt-0.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
