"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import PlanningSection from "./PlanningSection";
import { buildGoogleCalendarUrl, castNamesForDay } from "@/lib/calendar";
import {
  fetchConfirmations,
  fetchDateWindow,
  registerAvailabilityLinks,
  setDateWindow,
} from "@/lib/api";
import { candidateBlockConflicts, locationsInUse, unreviewedLocations } from "@/lib/locationAvailability";
import {
  Breakdown,
  CastOutreach,
  Confirmation,
  CrewMember,
  DateWindow,
  LocationAvailability,
  LocationResearch,
  OtherItem,
  ProposedPeriod,
  Schedule,
} from "@/lib/types";

type SubTab = "window" | "locations" | "roster";
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "window", label: "Shoot Window" },
  { key: "locations", label: "Location Research" },
  { key: "roster", label: "Roster & Availability" },
];

function relativeTime(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function blockLabel(block: string[]): string {
  if (block.length === 0) return "";
  const year = block[0].slice(0, 4);
  if (block.length === 1) return `${shortDate(block[0])}, ${year}`;
  return `${shortDate(block[0])} – ${shortDate(block[block.length - 1])}, ${year}`;
}

export default function DatesSection({
  projectName,
  sessionId,
  breakdown,
  schedule,
  locationResearch,
  updatedAt,
  castOutreach,
  castEmails,
  castPriority,
  crew,
  availabilityLinks,
  proposedPeriod,
  locationAvailability,
  otherItems,
  onUpdateCastEmails,
  onUpdateCastPriority,
  onRenameCastMember,
  onUpdateCastRole,
  onAddCastMember,
  onRemoveCastMember,
  onUpdateCrew,
  onUpdateProposedPeriod,
  onUpdateLocationAvailability,
  onUpdateOtherItems,
  onRequestReschedule,
  onLinksGenerated,
  onSetShootWindow,
  onUpdateSchedule,
}: {
  projectName: string;
  sessionId: string;
  breakdown: Breakdown;
  schedule: Schedule;
  locationResearch: Record<number, LocationResearch>;
  updatedAt: number | null;
  castOutreach: CastOutreach | null;
  castEmails: Record<string, string>;
  castPriority: Record<string, boolean>;
  crew: CrewMember[];
  availabilityLinks: Record<string, string>;
  proposedPeriod: ProposedPeriod | null;
  locationAvailability: Record<string, LocationAvailability>;
  otherItems: OtherItem[];
  onUpdateCastEmails: (emails: Record<string, string>) => void;
  onUpdateCastPriority: (priority: Record<string, boolean>) => void;
  onRenameCastMember: (oldName: string, newName: string) => void;
  onUpdateCastRole: (name: string, role_size: string) => void;
  onAddCastMember: (name: string, role_size: string) => void;
  onRemoveCastMember: (name: string) => void;
  onUpdateCrew: (crew: CrewMember[]) => void;
  onUpdateProposedPeriod: (period: ProposedPeriod | null) => void;
  onUpdateLocationAvailability: (a: Record<string, LocationAvailability>) => void;
  onUpdateOtherItems: (items: OtherItem[]) => void;
  onRequestReschedule: (text: string) => void;
  onLinksGenerated: (links: Record<string, string>) => void;
  onSetShootWindow: (start: string, end: string) => void;
  onUpdateSchedule: (schedule: Schedule) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("window");

  // --- Cast outreach (agent-drafted subject/body per cast member) ---
  const [sendingCastLinks, setSendingCastLinks] = useState(false);
  const [copiedCastName, setCopiedCastName] = useState<string | null>(null);
  const [castEmailStatus, setCastEmailStatus] = useState<
    Record<string, { sent: boolean; status: string }>
  >({});

  async function handleGenerateCastLinks() {
    if (!castOutreach || castOutreach.cast_outreach.length === 0) return;
    setSendingCastLinks(true);
    try {
      const result = await registerAvailabilityLinks(
        sessionId,
        projectName,
        castOutreach.cast_outreach.map((c) => ({
          name: c.name,
          scheduled_days: c.scheduled_days,
          email: castEmails[c.name] ?? "",
          email_subject: c.email_subject,
          email_body: c.email_body,
          priority: castPriority[c.name] ?? false,
        })),
        proposedPeriod
      );
      onLinksGenerated(result.links);
      setCastEmailStatus(result.emailStatus);
    } catch {
      // Registration failing just means links stay ungenerated — the
      // draft content is still fully visible either way.
    }
    setSendingCastLinks(false);
  }

  function copyCastEmail(entry: { name: string; email_subject: string; email_body: string }) {
    const token = availabilityLinks[entry.name];
    const body = token
      ? `${entry.email_body}\n\nLet us know here: ${window.location.origin}/availability/${token}`
      : entry.email_body;
    navigator.clipboard.writeText(`Subject: ${entry.email_subject}\n\n${body}`);
    setCopiedCastName(entry.name);
    setTimeout(() => setCopiedCastName(null), 1500);
  }

  // --- Shoot window (candidate-block priority-lock flow) ---
  const [dateWindow, setWindowState] = useState<DateWindow | null>(null);
  const [windowLoading, setWindowLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [numShootDays, setNumShootDays] = useState(schedule.shoot_days.length || 1);
  const [blackoutDraft, setBlackoutDraft] = useState("");
  const [blackoutDates, setBlackoutDates] = useState<string[]>([]);
  const [savingWindow, setSavingWindow] = useState(false);

  // --- Calendar view, once the schedule has real per-day dates ---
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const datedDays = schedule.shoot_days.filter((d) => d.date);
  const confirmedSet = new Set(confirmations.map((c) => `${c.actor_name}|${c.day_number}`));

  // Once someone locks a real block (from their actor-facing page — a
  // separate route we don't control), the "Proposed Shooting Period"
  // shown to everyone else should reflect that automatically instead of
  // sitting on whatever soft guess was typed in before the lock
  // happened. Only overwrites when it actually differs, so this doesn't
  // fight the filmmaker if they intentionally clear it afterward.
  function syncProposedPeriodFromLock(w: DateWindow | null) {
    if (!w?.locked_block || w.locked_block.length === 0) return;
    const start = w.locked_block[0];
    const end = w.locked_block[w.locked_block.length - 1];
    if (proposedPeriod?.start === start && proposedPeriod?.end === end) return;
    onUpdateProposedPeriod({ start, end });
  }

  // The actor-facing lock flow backfills real per-day dates on the
  // backend (see availability_routes.lock_window) so THAT actor's own
  // page and the confirmations list are correct immediately. But this
  // app's Status/Availability tabs read dates off the locally-cached
  // `schedule.shoot_days[].date` — a completely separate copy that the
  // backend has no way to reach — so without this, every shoot day
  // stays "undated" here forever even after someone locks real dates,
  // and Status keeps waiting for a *proposal* (the undated-day signal)
  // instead of the *confirmation* that was actually recorded. Day N
  // maps to the Nth date in the locked block, same as the backend.
  function syncScheduleDatesFromLock(w: DateWindow | null) {
    if (!w?.locked_block || w.locked_block.length === 0) return;
    const locked = w.locked_block;
    let changed = false;
    const nextDays = schedule.shoot_days.map((d) => {
      const idx = d.day_number - 1;
      if (idx >= 0 && idx < locked.length && d.date !== locked[idx]) {
        changed = true;
        return { ...d, date: locked[idx] };
      }
      return d;
    });
    if (changed) onUpdateSchedule({ ...schedule, shoot_days: nextDays });
  }

  async function loadWindow() {
    setWindowLoading(true);
    const w = await fetchDateWindow(sessionId);
    setWindowState(w);
    if (w) {
      setStart(w.start);
      setEnd(w.end);
      setNumShootDays(w.num_shoot_days);
      setBlackoutDates(w.blackout_dates);
      syncProposedPeriodFromLock(w);
      syncScheduleDatesFromLock(w);
    }
    setWindowLoading(false);
  }

  useEffect(() => {
    loadWindow();
    fetchConfirmations(sessionId).then(setConfirmations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function addBlackoutDate() {
    if (!blackoutDraft || blackoutDates.includes(blackoutDraft)) return;
    setBlackoutDates((prev) => [...prev, blackoutDraft].sort());
    setBlackoutDraft("");
  }

  function removeBlackoutDate(date: string) {
    setBlackoutDates((prev) => prev.filter((d) => d !== date));
  }

  async function handleSaveWindow() {
    if (!start || !end || numShootDays < 1) return;
    setSavingWindow(true);
    try {
      const result = await setDateWindow(sessionId, start, end, blackoutDates, numShootDays);
      setWindowState(result);
    } catch {
      // Leaves the prior window state visible — nothing silently lost.
    }
    setSavingWindow(false);
  }

  const slots = Object.entries(locationResearch)
    .map(([slot, r]) => ({ slot: Number(slot), r }))
    .filter(({ r }) => r.assigned)
    .sort((a, b) => a.slot - b.slot);

  // A public location can genuinely be closed on some of the days a
  // candidate block proposes — real day-of-week/window arithmetic
  // against every in-use location, not a guess. Outreach to cast/crew/
  // other is gated on the production team actually reviewing every
  // location first (see the "reviewed" flag on each Location card in
  // the Roster tab), so a location can't silently get skipped.
  const usedLocations = locationsInUse(breakdown, schedule);
  const unreviewed = unreviewedLocations(breakdown, schedule, locationAvailability);
  const candidateConflicts = (dateWindow?.candidate_blocks ?? []).map((block) =>
    candidateBlockConflicts(block, locationAvailability, usedLocations)
  );
  const lockedConflicts = dateWindow?.locked_block
    ? candidateBlockConflicts(dateWindow.locked_block, locationAvailability, usedLocations)
    : [];

  return (
    <div>
      <StageHeader
        index={4}
        title="Dates"
        description="Top to bottom: set the real shoot window here, check it against location research, send cast/crew/other outreach, resolve whatever gets flagged, then get a real calendar once everyone's locked in."
      />

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

      {subTab === "window" && (
        <>
          <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="tracked text-[10px] text-faint uppercase">Candidate Shoot Window</div>
              <button
                onClick={loadWindow}
                disabled={windowLoading}
                className="tracked text-[10px] text-faint uppercase transition hover:text-dim disabled:opacity-50"
              >
                {windowLoading ? "Checking..." : "↻ Refresh"}
              </button>
            </div>
            <p className="mb-3 text-xs text-faint">
              The real range you&apos;re aiming for — once you generate outreach links on the Roster
              tab, the highest-priority cast/crew/other person gets first pick of a real N-day
              block inside this range (never a date inside a blackout date below). Everyone else
              follows in priority order. Once they lock a block, it appears below and the Proposed
              Shooting Period on the Roster tab updates to match automatically.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Start</span>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">End</span>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Shoot days needed</span>
                <input
                  type="number"
                  min={1}
                  value={numShootDays}
                  onChange={(e) => setNumShootDays(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <button
                onClick={handleSaveWindow}
                disabled={!start || !end || savingWindow}
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
              >
                {savingWindow ? "Saving..." : dateWindow ? "Update window" : "Set window"}
              </button>
            </div>

            <div className="mt-3">
              <span className="text-[10px] text-faint">Blackout dates (nobody&apos;s available)</span>
              {blackoutDates.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {blackoutDates.map((d) => (
                    <button
                      key={d}
                      onClick={() => removeBlackoutDate(d)}
                      title="Remove"
                      className="tracked rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] uppercase text-red-700 transition hover:bg-red-500/20"
                    >
                      {d} ×
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="date"
                  value={blackoutDraft}
                  onChange={(e) => setBlackoutDraft(e.target.value)}
                  className="rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                />
                <button
                  onClick={addBlackoutDate}
                  disabled={!blackoutDraft}
                  className="tracked rounded-full border border-edge px-2 py-1 text-[9px] uppercase text-faint transition hover:text-accent disabled:opacity-40"
                >
                  Add blackout date
                </button>
              </div>
            </div>
          </div>

          {!windowLoading && dateWindow && (
            <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
              {dateWindow.error ? (
                <p className="text-xs text-red-700">{dateWindow.error}</p>
              ) : dateWindow.locked_block ? (
                <div>
                  <div className="tracked text-[10px] text-accent uppercase">Locked</div>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {blockLabel(dateWindow.locked_block)}
                  </p>
                  {lockedConflicts.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2">
                      {lockedConflicts.map((msg, i) => (
                        <p key={i} className="text-[11px] text-red-700">
                          ⚠ {msg}
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      onSetShootWindow(
                        dateWindow.locked_block![0],
                        dateWindow.locked_block![dateWindow.locked_block!.length - 1]
                      )
                    }
                    className="tracked mt-3 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20"
                  >
                    Assign these dates to the schedule →
                  </button>
                </div>
              ) : (
                <div>
                  <div className="tracked text-[10px] text-faint uppercase">
                    Candidate blocks ({dateWindow.candidate_blocks.length})
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    Nobody has picked yet — the highest-priority person to receive a link will see
                    these on their availability page. A block flagged below falls on a day a
                    location you&apos;ve reviewed says it&apos;s closed.
                  </p>
                  <div className="mt-2 space-y-2">
                    {dateWindow.candidate_blocks.map((b, i) => (
                      <div key={i}>
                        <span className="rounded-full bg-panel2 px-3 py-1 text-xs text-dim">
                          {blockLabel(b)}
                        </span>
                        {candidateConflicts[i]?.length > 0 && (
                          <div className="mt-1 space-y-0.5 pl-1">
                            {candidateConflicts[i].map((msg, j) => (
                              <p key={j} className="text-[11px] text-amber">
                                ⚠ {msg}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {datedDays.length === 0 ? (
            <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
              No real per-day shoot dates assigned yet — once a block is locked above, click
              &quot;Assign these dates to the schedule&quot; to have the Scheduling Agent lay out
              scenes across those exact days.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {datedDays.map((day) => {
                const castOnDay = castNamesForDay(day, breakdown);
                const url = buildGoogleCalendarUrl({ projectName, day, breakdown, castEmails, crew });
                return (
                  <div key={day.day_number} className="rounded-xl border border-edge bg-panel p-4">
                    <div className="tracked text-[10px] text-faint uppercase">
                      Day {day.day_number}
                    </div>
                    <div className="mt-1 text-sm font-medium text-accent">{day.date}</div>
                    <div className="mt-1 text-xs text-dim">{day.locations.join(", ")}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge/60 pt-3">
                      {castOnDay.map((name) => {
                        const confirmed = confirmedSet.has(`${name}|${day.day_number}`);
                        return (
                          <span
                            key={name}
                            className={`rounded-full px-2 py-0.5 text-[10px] ${
                              confirmed ? "bg-accent/15 text-accent" : "bg-panel2 text-dim"
                            }`}
                          >
                            {confirmed ? `${name} ✓` : name}
                          </span>
                        );
                      })}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="tracked mt-3 inline-block text-[10px] text-accent uppercase transition hover:brightness-125"
                      >
                        Add to Google Calendar →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {subTab === "locations" &&
        (slots.length === 0 ? (
          <div className="rounded-xl border border-edge bg-panel p-6 text-sm text-faint">
            No location research yet — mention a real shoot city/region so the agents know where
            to search.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map(({ slot, r }) => {
              const intExt = breakdown?.locations.find((l) => l.name === r.location_name)?.int_ext;
              const notes = [r.permit_notes, r.weather_notes, r.logistics_notes].filter(Boolean);

              return (
                <div key={slot} className="rounded-xl border border-edge bg-panel p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className="text-lg uppercase leading-tight"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {r.location_name}
                    </h3>
                    <span
                      className={`tracked shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase ${
                        r.research_blocked ? "bg-red-500/15 text-red-700" : "bg-panel2 text-faint"
                      }`}
                    >
                      {r.research_blocked ? "Blocked" : intExt ?? "—"}
                    </span>
                  </div>

                  {r.research_blocked ? (
                    <p className="mt-3 text-xs text-dim">{r.logistics_notes}</p>
                  ) : (
                    <>
                      {r.hours_notes && (
                        <div className="mt-3 rounded-md border-l-2 border-amber/50 bg-amber/10 px-3 py-2">
                          <p className="text-[11px] text-amber">Hours: {r.hours_notes}</p>
                        </div>
                      )}
                      <div className="mt-3 divide-y divide-edge/60">
                        {notes.map((note, i) => (
                          <p key={i} className="py-2 text-xs text-dim first:pt-0 last:pb-0">
                            {note}
                          </p>
                        ))}
                      </div>
                    </>
                  )}

                  {(r.nearest_hospital || r.emergency_contacts) && (
                    <div className="mt-3 rounded-md border-l-2 border-amber/50 bg-amber/10 px-3 py-2">
                      {r.nearest_hospital && (
                        <p className="text-[11px] text-amber">Hospital: {r.nearest_hospital}</p>
                      )}
                      {r.emergency_contacts && (
                        <p className="mt-0.5 text-[11px] text-amber">{r.emergency_contacts}</p>
                      )}
                    </div>
                  )}

                  {r.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge/60 pt-3">
                      {r.sources.slice(0, 3).map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-edge px-2 py-0.5 text-[9px] text-faint transition hover:border-accent hover:text-accent"
                        >
                          {s.title || s.url}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="tracked mt-3 text-[9px] text-faint">
                    via Parallel{updatedAt ? ` · updated ${relativeTime(updatedAt)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {subTab === "roster" && (
        <>
          {unreviewed.length > 0 && (
            <div className="mb-6 rounded-md border-l-2 border-amber/60 bg-amber/10 px-4 py-3 text-sm text-amber">
              {unreviewed.length} location{unreviewed.length > 1 ? "s" : ""} not yet reviewed:{" "}
              {unreviewed.join(", ")}. Outreach below is disabled until each one is checked for
              real closures/hours and marked reviewed on its Location card.
            </div>
          )}

          {castOutreach && castOutreach.cast_outreach.length > 0 && (
            <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="tracked text-[10px] text-faint uppercase">Cast Outreach</div>
                <button
                  onClick={handleGenerateCastLinks}
                  disabled={sendingCastLinks || unreviewed.length > 0}
                  title={unreviewed.length > 0 ? "Review all locations first" : undefined}
                  className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
                >
                  {sendingCastLinks ? "Generating..." : "↻ Generate links"}
                </button>
              </div>
              <p className="mb-3 text-xs text-faint">
                Sends the agent-drafted outreach email to each cast member with an address on
                file (below), via Mailpit or whatever SMTP catcher MAILPIT_HOST points at.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {castOutreach.cast_outreach.map((entry) => {
                  const token = availabilityLinks[entry.name];
                  const status = castEmailStatus[entry.name];
                  return (
                    <div key={entry.name} className="rounded-lg border border-edge/60 bg-panel2 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-ink">
                          {entry.name}
                          {castPriority[entry.name] && <span className="text-accent"> · priority</span>}
                        </div>
                        <span className="tracked rounded-full bg-panel px-2 py-0.5 text-[9px] uppercase text-faint">
                          {entry.role_size}
                        </span>
                      </div>
                      <div className="mt-2 rounded-md border border-edge/60 bg-panel p-2">
                        <div className="text-[11px] font-medium text-ink">{entry.email_subject}</div>
                        <p className="mt-1 text-[10px] text-dim">{entry.email_body}</p>
                      </div>
                      {status && (
                        <p className={`mt-1 text-[10px] ${status.sent ? "text-accent" : "text-faint"}`}>
                          {status.sent
                            ? `✓ Sent to ${castEmails[entry.name] ?? "their address"} — check Mailpit`
                            : `Not sent — ${status.status}`}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => copyCastEmail(entry)}
                          className="tracked text-[10px] text-faint uppercase transition hover:text-accent"
                        >
                          {copiedCastName === entry.name ? "Copied!" : "Copy email"}
                        </button>
                        {token ? (
                          <a
                            href={`/availability/${token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="tracked text-[10px] text-accent uppercase transition hover:brightness-125"
                          >
                            Open actor link →
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

          <PlanningSection
          projectName={projectName}
          sessionId={sessionId}
          breakdown={breakdown}
          schedule={schedule}
          castEmails={castEmails}
          castPriority={castPriority}
          crew={crew}
          availabilityLinks={availabilityLinks}
          proposedPeriod={proposedPeriod}
          locationAvailability={locationAvailability}
          otherItems={otherItems}
          onUpdateCastEmails={onUpdateCastEmails}
          onUpdateCastPriority={onUpdateCastPriority}
          onRenameCastMember={onRenameCastMember}
          onUpdateCastRole={onUpdateCastRole}
          onAddCastMember={onAddCastMember}
          onRemoveCastMember={onRemoveCastMember}
          onUpdateCrew={onUpdateCrew}
          onUpdateProposedPeriod={onUpdateProposedPeriod}
          onUpdateLocationAvailability={onUpdateLocationAvailability}
            onUpdateOtherItems={onUpdateOtherItems}
            onRequestReschedule={onRequestReschedule}
            onLinksGenerated={onLinksGenerated}
            unreviewedLocations={unreviewed}
            locationResearch={locationResearch}
          />
        </>
      )}
    </div>
  );
}
