"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import { fetchDateWindow, registerAvailabilityLinks, setDateWindow } from "@/lib/api";
import { candidateBlockConflicts, emptyAvailability, locationsInUse, unreviewedLocations } from "@/lib/locationAvailability";
import { friendlyDate } from "@/lib/text";
import { computeHoursWorked, computePay, formatCurrency } from "@/lib/timecards";
import {
  Breakdown,
  CallSheets,
  CastOutreach,
  CrewMember,
  DateWindow,
  LocationAvailability,
  LocationResearch,
  PayRate,
  ProposedPeriod,
  Schedule,
  StageKey,
  Task,
  TimeCard,
} from "@/lib/types";

function blockLabel(block: string[]): string {
  if (block.length === 0) return "";
  if (block.length === 1) return friendlyDate(block[0]);
  return `${friendlyDate(block[0])} – ${friendlyDate(block[block.length - 1])}`;
}

function StepCard({
  n,
  title,
  status,
  children,
}: {
  n: number;
  title: string;
  status: "done" | "attention" | "pending";
  children: React.ReactNode;
}) {
  const dot =
    status === "done"
      ? "border-accent/50 bg-accent/15 text-accent"
      : status === "attention"
        ? "border-amber/50 bg-amber/15 text-amber"
        : "border-edge bg-panel2 text-faint";
  return (
    <div className="rounded-xl border border-edge bg-panel p-5">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`tracked flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${dot}`}
        >
          {status === "done" ? "✓" : n}
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  );
}

export default function AutopilotSection({
  projectName,
  sessionId,
  breakdown,
  schedule,
  callSheets,
  crew,
  castEmails,
  castPriority,
  availabilityLinks,
  proposedPeriod,
  locationAvailability,
  locationResearch,
  castOutreach,
  tasks,
  timeCards,
  payRates,
  onUpdateCastEmails,
  onUpdateLocationAvailability,
  onLinksGenerated,
  onGoToStage,
}: {
  projectName: string;
  sessionId: string;
  breakdown: Breakdown | null;
  schedule: Schedule | null;
  callSheets: CallSheets | null;
  crew: CrewMember[];
  castEmails: Record<string, string>;
  castPriority: Record<string, boolean>;
  availabilityLinks: Record<string, string>;
  proposedPeriod: ProposedPeriod | null;
  locationAvailability: Record<string, LocationAvailability>;
  locationResearch: Record<number, LocationResearch>;
  castOutreach: CastOutreach | null;
  tasks: Task[];
  timeCards: TimeCard[];
  payRates: Record<string, PayRate>;
  onUpdateCastEmails: (emails: Record<string, string>) => void;
  onUpdateLocationAvailability: (v: Record<string, LocationAvailability>) => void;
  onLinksGenerated: (links: Record<string, string>) => void;
  onGoToStage: (stage: StageKey) => void;
}) {
  const [dateWindow, setWindowState] = useState<DateWindow | null>(null);
  const [windowLoading, setWindowLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [numShootDays, setNumShootDays] = useState(1);
  const [savingWindow, setSavingWindow] = useState(false);

  const [sendingCastLinks, setSendingCastLinks] = useState(false);

  // Inline "the agent got stuck, here's what it needs" fields — kept as
  // local drafts (not written to the project) until explicitly saved:
  // nothing should overwrite real project state on every keystroke.
  const [addressDrafts, setAddressDrafts] = useState<Record<string, string>>({});
  const [castEmailDrafts, setCastEmailDrafts] = useState<Record<string, string>>({});

  async function loadWindow() {
    setWindowLoading(true);
    const w = await fetchDateWindow(sessionId);
    setWindowState(w);
    if (w) {
      setStart(w.start);
      setEnd(w.end);
      setNumShootDays(w.num_shoot_days);
    }
    setWindowLoading(false);
  }

  useEffect(() => {
    loadWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleSaveWindow() {
    if (!start || !end || numShootDays < 1) return;
    setSavingWindow(true);
    try {
      const result = await setDateWindow(sessionId, start, end, [], numShootDays);
      setWindowState(result);
    } catch {
      // Prior window state stays visible — nothing silently lost.
    }
    setSavingWindow(false);
  }

  if (!breakdown) {
    return (
      <div>
        <StageHeader
          index={1}
          title="Autopilot"
          description="Walks the whole production end to end: cast/crew, shoot dates, location checks, actor outreach, then a full plan."
        />
        <p className="text-sm text-faint">Upload a script or production data first — see the dashboard.</p>
      </div>
    );
  }

  const usedLocations = locationsInUse(breakdown, schedule);
  const unreviewed = unreviewedLocations(breakdown, schedule, locationAvailability);
  const activeBlock = dateWindow?.locked_block ?? dateWindow?.candidate_blocks?.[0] ?? [];
  const conflicts = activeBlock.length > 0 ? candidateBlockConflicts(activeBlock, locationAvailability, usedLocations) : [];

  const castCount = breakdown.cast.length;
  const crewCount = crew.length;
  const membersDone = castCount > 0 || crewCount > 0;
  const windowDone = !!dateWindow && (!!dateWindow.locked_block || dateWindow.candidate_blocks.length > 0);
  const locationsDone = usedLocations.length > 0 && unreviewed.length === 0 && conflicts.length === 0;
  const castLinksTotal = castOutreach?.cast_outreach.length ?? 0;
  const castLinksSent = castOutreach?.cast_outreach.filter((c) => !!availabilityLinks[c.name]).length ?? 0;
  const actorsDone = castLinksTotal > 0 && castLinksSent === castLinksTotal;
  const missingCastEmails = (castOutreach?.cast_outreach ?? []).filter((c) => !castEmails[c.name]?.trim());
  const planDone = (schedule?.shoot_days.some((d) => d.date) ?? false) && !!callSheets && callSheets.call_sheets.length > 0;
  const openTasks = tasks.filter((t) => t.status !== "done");
  const tasksDone = tasks.length > 0 && openTasks.length === 0;
  const openTimeCards = timeCards.filter((t) => t.status !== "approved");
  const timeCardsDone = timeCards.length > 0 && openTimeCards.length === 0;
  const totalLaborCost = timeCards.reduce((sum, t) => {
    const hours = computeHoursWorked(t.callTime, t.wrapTime, t.mealBreakMinutes);
    return sum + computePay(hours, payRates[t.personName]).totalPay;
  }, 0);

  async function handleSendActorOutreach() {
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
    } catch {
      // Leaves prior link state visible — nothing silently lost.
    }
    setSendingCastLinks(false);
  }

  /** Why the Location Research agent couldn't fill this location in —
   * e.g. "need to know what city/region this is filming in" — so the
   * filmmaker sees the actual blocker instead of a bare "needs review". */
  function blockedReasonFor(name: string): string {
    const entry = Object.values(locationResearch).find(
      (r) => r.location_name === name && r.research_blocked
    );
    return entry?.logistics_notes ?? "";
  }

  function patchLocationAvailability(name: string, patch: Partial<LocationAvailability>) {
    const current = locationAvailability[name] ?? emptyAvailability(name);
    onUpdateLocationAvailability({ ...locationAvailability, [name]: { ...current, ...patch } });
  }

  function saveAddressAndReview(name: string) {
    const address = (addressDrafts[name] ?? locationAvailability[name]?.address ?? "").trim();
    patchLocationAvailability(name, { address, reviewed: true });
  }

  function saveCastEmail(name: string) {
    const email = (castEmailDrafts[name] ?? "").trim();
    if (!email) return;
    onUpdateCastEmails({ ...castEmails, [name]: email });
  }

  return (
    <div>
      <StageHeader
        index={1}
        title="Autopilot"
        description="Walks the whole production end to end: cast/crew, shoot dates, location checks, actor outreach, then a full plan. Every email is drafted for review — nothing sends without you clicking Send."
      />

      <div className="space-y-4">
        <StepCard n={1} title="Cast & crew on the roster" status={membersDone ? "done" : "pending"}>
          <p className="text-xs text-dim">
            {castCount} cast, {crewCount} crew on file.
          </p>
          <button
            onClick={() => onGoToStage("members")}
            className="tracked mt-2 rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
          >
            Go to Members →
          </button>
        </StepCard>

        <StepCard n={2} title="Shoot dates" status={windowDone ? "done" : "pending"}>
          {windowLoading ? (
            <p className="text-xs text-faint">Checking...</p>
          ) : (
            <>
              {dateWindow?.locked_block ? (
                <p className="text-xs text-accent">Locked: {blockLabel(dateWindow.locked_block)}</p>
              ) : dateWindow ? (
                <p className="text-xs text-dim">
                  {dateWindow.candidate_blocks.length} candidate block(s) proposed, none locked yet.
                </p>
              ) : (
                <p className="text-xs text-faint">No shoot window set yet.</p>
              )}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-faint">Start</span>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-faint">End</span>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-faint">Days needed</span>
                  <input
                    type="number"
                    min={1}
                    value={numShootDays}
                    onChange={(e) => setNumShootDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                <button
                  onClick={handleSaveWindow}
                  disabled={!start || !end || savingWindow}
                  className="btn-poster rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {savingWindow ? "Saving..." : dateWindow ? "Update window" : "Set window"}
                </button>
                <button
                  onClick={() => onGoToStage("dates")}
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
                >
                  Full Production Plan tab →
                </button>
              </div>
            </>
          )}
        </StepCard>

        <StepCard
          n={3}
          title="Check locations"
          status={usedLocations.length === 0 ? "pending" : locationsDone ? "done" : "attention"}
        >
          {usedLocations.length === 0 ? (
            <p className="text-xs text-faint">No locations yet.</p>
          ) : (
            <>
              {unreviewed.length > 0 && (
                <div className="space-y-3">
                  {unreviewed.map((loc) => {
                    const reason = blockedReasonFor(loc);
                    const avail = locationAvailability[loc];
                    const addressDraft = addressDrafts[loc] ?? avail?.address ?? "";
                    return (
                      <div key={loc} className="rounded-lg border border-amber/50 bg-amber/5 p-3">
                        <p className="text-xs font-medium text-ink">{loc} — needs your input</p>
                        <p className="mt-1 text-xs text-amber">
                          {reason ||
                            "The location research agent couldn't verify this automatically — confirm it yourself below."}
                        </p>
                        <label className="mt-2 flex flex-col gap-1">
                          <span className="text-[10px] text-faint">
                            Address / city / region (unblocks research and shows on the call sheet)
                          </span>
                          <input
                            type="text"
                            value={addressDraft}
                            onChange={(e) => setAddressDrafts((prev) => ({ ...prev, [loc]: e.target.value }))}
                            placeholder="e.g. 214 Barton Springs Rd, Austin, TX"
                            className="rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                          />
                        </label>
                        <button
                          onClick={() => saveAddressAndReview(loc)}
                          className="tracked mt-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] uppercase text-accent transition hover:bg-accent/20"
                        >
                          Save &amp; mark reviewed
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {conflicts.length > 0 && (
                <div className="mt-1 space-y-1">
                  {conflicts.map((c, i) => (
                    <p key={i} className="text-xs text-coral">
                      ⚠ {c}
                    </p>
                  ))}
                </div>
              )}
              {locationsDone && <p className="text-xs text-accent">✓ All locations reviewed, no date conflicts.</p>}
              <button
                onClick={() => onGoToStage("dates")}
                className="tracked mt-2 rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
              >
                Full location editor in Production Plan →
              </button>
            </>
          )}
        </StepCard>

        <StepCard
          n={4}
          title="Notify actors"
          status={castLinksTotal === 0 ? "pending" : actorsDone ? "done" : "attention"}
        >
          {castLinksTotal === 0 ? (
            <p className="text-xs text-faint">No cast outreach drafted yet — runs automatically once the schedule is validated.</p>
          ) : (
            <>
              <p className="text-xs text-dim">
                {castLinksSent} of {castLinksTotal} cast member(s) sent their availability request.
              </p>
              {missingCastEmails.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-amber">
                    Missing an email for {missingCastEmails.length} cast member(s) — add one to notify them.
                  </p>
                  {missingCastEmails.map((c) => (
                    <div key={c.name} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-[11px] font-medium text-ink">{c.name}</span>
                      <input
                        type="email"
                        value={castEmailDrafts[c.name] ?? ""}
                        onChange={(e) => setCastEmailDrafts((prev) => ({ ...prev, [c.name]: e.target.value }))}
                        placeholder="Email"
                        className="min-w-[160px] flex-1 rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                      />
                      <button
                        onClick={() => saveCastEmail(c.name)}
                        disabled={!castEmailDrafts[c.name]?.trim()}
                        className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] uppercase text-accent transition hover:bg-accent/20 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleSendActorOutreach}
                disabled={sendingCastLinks || unreviewed.length > 0}
                title={unreviewed.length > 0 ? "Review all locations first" : undefined}
                className="tracked mt-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[10px] uppercase text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                {sendingCastLinks ? "Sending..." : "Send actor outreach"}
              </button>
            </>
          )}
        </StepCard>

        <StepCard n={5} title="Full plan" status={planDone ? "done" : "pending"}>
          {planDone ? (
            <>
              <p className="text-xs text-accent">✓ Real dates assigned and call sheets generated.</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onGoToStage("callSheet")}
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
                >
                  Open Call Sheet →
                </button>
                <button
                  onClick={() => onGoToStage("dashboard")}
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
                >
                  Open Dashboard →
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-faint">Not ready yet — finish the steps above.</p>
          )}
        </StepCard>

        <StepCard n={6} title="Tasks" status={tasks.length === 0 ? "pending" : tasksDone ? "done" : "attention"}>
          {tasks.length === 0 ? (
            <p className="text-xs text-faint">No tasks added yet.</p>
          ) : (
            <p className="text-xs text-dim">
              {openTasks.length} open, {tasks.length - openTasks.length} done, {tasks.length} total.
            </p>
          )}
          <button
            onClick={() => onGoToStage("tasks")}
            className="tracked mt-2 rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
          >
            Go to Task Master →
          </button>
        </StepCard>

        <StepCard
          n={7}
          title="Time cards"
          status={timeCards.length === 0 ? "pending" : timeCardsDone ? "done" : "attention"}
        >
          {timeCards.length === 0 ? (
            <p className="text-xs text-faint">No time cards logged yet.</p>
          ) : (
            <p className="text-xs text-dim">
              {openTimeCards.length} pending, {timeCards.length - openTimeCards.length} approved,{" "}
              {timeCards.length} total · {formatCurrency(totalLaborCost)} total labor cost.
            </p>
          )}
          <button
            onClick={() => onGoToStage("payroll")}
            className="tracked mt-2 rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:text-accent"
          >
            Go to Time Cards →
          </button>
        </StepCard>
      </div>
    </div>
  );
}
