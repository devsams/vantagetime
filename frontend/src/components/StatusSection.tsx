"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import { castNamesForDay } from "@/lib/calendar";
import { fetchCancellations, fetchConfirmations, fetchProposals } from "@/lib/api";
import {
  Breakdown,
  Cancellation,
  Confirmation,
  CrewMember,
  DateProposal,
  Schedule,
  ShootDay,
} from "@/lib/types";

type StatusKey = "unavailable" | "pending" | "awaiting_dates" | "locked_in" | "no_days";

const STATUS_LABEL: Record<StatusKey, string> = {
  unavailable: "Unavailable",
  pending: "Pending",
  awaiting_dates: "Awaiting dates",
  locked_in: "Locked in",
  no_days: "Not scheduled",
};

const STATUS_STYLE: Record<StatusKey, string> = {
  unavailable: "border-red-500/50 bg-red-500/10 text-red-300",
  pending: "border-edge bg-panel2 text-dim",
  awaiting_dates: "border-amber/50 bg-amber/10 text-amber",
  locked_in: "border-accent/50 bg-accent/15 text-accent",
  no_days: "border-edge bg-panel2 text-faint",
};

interface PersonRow {
  key: string;
  name: string;
  type: "Cast" | "Crew";
  roleLabel: string;
  priority: boolean;
  daysOn: number[];
  email: string;
  hasLink: boolean;
  status: StatusKey;
  detail: string;
}

/** Real cross-referencing against cancellations/proposals/confirmations
 * already gathered from the actor-facing pages — never a guess about
 * who's ready. A person is only "locked in" once every day they're
 * needed on is both dated AND explicitly confirmed. */
function computeStatus(
  name: string,
  daysOn: ShootDay[],
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

export default function StatusSection({
  breakdown,
  schedule,
  crew,
  castEmails,
  castPriority,
  availabilityLinks,
  sessionId,
}: {
  breakdown: Breakdown;
  schedule: Schedule;
  crew: CrewMember[];
  castEmails: Record<string, string>;
  castPriority: Record<string, boolean>;
  availabilityLinks: Record<string, string>;
  sessionId: string;
}) {
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [proposals, setProposals] = useState<DateProposal[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [checking, setChecking] = useState(false);

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

  const rows: PersonRow[] = [];

  for (const member of breakdown.cast) {
    const daysOn = schedule.shoot_days.filter((d) => castNamesForDay(d, breakdown).includes(member.name));
    const { status, detail } = computeStatus(member.name, daysOn, cancellations, confirmations, proposals);
    rows.push({
      key: `cast-${member.name}`,
      name: member.name,
      type: "Cast",
      roleLabel: member.role_size,
      priority: !!castPriority[member.name],
      daysOn: daysOn.map((d) => d.day_number),
      email: castEmails[member.name] ?? "",
      hasLink: !!availabilityLinks[member.name],
      status,
      detail,
    });
  }

  // Crew is assumed needed every shoot day (unlike cast, who only work
  // the days their character is in a scene).
  for (const member of crew) {
    const daysOn = schedule.shoot_days;
    const { status, detail } = computeStatus(member.name, daysOn, cancellations, confirmations, proposals);
    rows.push({
      key: `crew-${member.id}`,
      name: member.name,
      type: "Crew",
      roleLabel: member.role || "Crew",
      priority: member.priority,
      daysOn: daysOn.map((d) => d.day_number),
      email: member.email,
      hasLink: !!availabilityLinks[member.name],
      status,
      detail,
    });
  }

  // Priority people surface first, then by status severity (the ones
  // that need attention first), then alphabetically.
  const STATUS_RANK: Record<StatusKey, number> = {
    unavailable: 0,
    pending: 1,
    awaiting_dates: 2,
    no_days: 3,
    locked_in: 4,
  };
  rows.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return a.name.localeCompare(b.name);
  });

  const trackable = rows.filter((r) => r.status !== "no_days");
  const lockedCount = trackable.filter((r) => r.status === "locked_in").length;
  const unavailableCount = trackable.filter((r) => r.status === "unavailable").length;
  const pendingCount = trackable.filter((r) => r.status === "pending").length;
  const awaitingCount = trackable.filter((r) => r.status === "awaiting_dates").length;
  const allLocked = trackable.length > 0 && lockedCount === trackable.length;

  return (
    <div>
      <StageHeader
        index={6}
        title="Status"
        description="One table for the production house: who's responded, who's still pending, and whether everyone is actually locked in for their scheduled days."
        action={
          <button
            onClick={checkResponses}
            disabled={checking}
            className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-faint transition hover:text-dim disabled:opacity-50"
          >
            {checking ? "Checking..." : "↻ Recheck"}
          </button>
        }
      />

      <div
        className={`mb-6 rounded-xl border p-4 text-sm ${
          allLocked
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-amber/50 bg-amber/10 text-amber"
        }`}
      >
        {allLocked
          ? `✓ Everything is locked in — ${lockedCount} of ${trackable.length} people confirmed on every scheduled day.`
          : `Not locked in yet — ${lockedCount} locked in, ${pendingCount} pending, ${awaitingCount} awaiting final dates, ${unavailableCount} unavailable (of ${trackable.length}).`}
      </div>

      <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-edge text-[10px] uppercase tracked text-faint">
              <th className="px-4 py-3 font-normal">Name</th>
              <th className="px-4 py-3 font-normal">Type</th>
              <th className="px-4 py-3 font-normal">Role</th>
              <th className="px-4 py-3 font-normal">Days</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-edge/60 last:border-0">
                <td className="px-4 py-3 text-ink">
                  {r.name}
                  {r.priority && <span className="text-accent"> ★</span>}
                </td>
                <td className="px-4 py-3 text-dim">{r.type}</td>
                <td className="px-4 py-3 text-dim">{r.roleLabel}</td>
                <td className="px-4 py-3 text-dim">
                  {r.daysOn.length > 0 ? r.daysOn.map((d) => `D${d}`).join(", ") : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`tracked inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status]}`}
                    title={r.detail}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <div className="mt-1 text-[10px] text-faint">{r.detail}</div>
                </td>
                <td className="px-4 py-3 text-[10px]">
                  {r.email ? (
                    <span className="text-dim">{r.email}</span>
                  ) : (
                    <span className="text-red-300">No email</span>
                  )}
                  {r.hasLink && <span className="tracked ml-2 text-accent uppercase">Link sent</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-faint">
                  No cast or crew to track yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
