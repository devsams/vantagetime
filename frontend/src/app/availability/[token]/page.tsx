"use client";

import { use, useEffect, useState } from "react";
import { confirmDay, fetchActorView, lockDateWindow, proposeDates } from "@/lib/api";
import { ActorView } from "@/lib/types";

/** "2026-01-16" -> "Jan 16" — short enough to fit in a button, still
 * unambiguous next to the year shown once in the block's label. */
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

const MIN_DATES = 3;

function ProposeForm({
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: (count: number) => string;
  onSubmit: (dates: string[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const [dates, setDates] = useState<string[]>(Array(MIN_DATES).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = dates.filter((d) => d);
  const distinct = new Set(filled);
  const canSubmit = filled.length >= MIN_DATES && distinct.size === filled.length;

  function setDate(i: number, value: string) {
    setDates((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(filled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <p className="text-xs text-black/70">{label}</p>
      <div className="mt-3 space-y-2">
        {dates.map((d, i) => (
          <input
            key={i}
            type="date"
            value={d}
            onChange={(e) => setDate(i, e.target.value)}
            className="w-full rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs text-black/80 focus:border-black/40 focus:outline-none"
          />
        ))}
      </div>
      <button
        onClick={() => setDates((prev) => [...prev, ""])}
        className="mt-2 text-[11px] font-medium text-black/50 underline underline-offset-2 hover:text-black/70"
      >
        + Add another date
      </button>

      {distinct.size !== filled.length && filled.length > 0 && (
        <p className="mt-2 text-[11px] text-coral">Each date should be different.</p>
      )}
      {error && <p className="mt-2 text-[11px] text-coral">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="rounded-full bg-[#000000] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? "Sending..." : submitLabel(filled.length)}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-[11px] text-black/50 underline underline-offset-2 hover:text-black/70"
          >
            Never mind
          </button>
        )}
      </div>
    </div>
  );
}

export default function AvailabilityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<ActorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [locking, setLocking] = useState<number | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  useEffect(() => {
    fetchActorView(token).then((v) => {
      setView(v);
      setLoading(false);
    });
  }, [token]);

  async function handlePropose(dayNumber: number, dates: string[], alsoCancel: boolean) {
    const error = await proposeDates(token, dayNumber, dates, alsoCancel);
    if (error) throw new Error(error);
    setView((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d) =>
              d.day_number === dayNumber
                ? {
                    ...d,
                    cancelled: alsoCancel ? true : d.cancelled,
                    confirmed: alsoCancel ? false : d.confirmed,
                    proposed_dates: dates,
                  }
                : d
            ),
          }
        : prev
    );
    setOpenForm(null);
  }

  async function handlePickBlock(blockIndex: number) {
    if (!view) return;
    setLocking(blockIndex);
    setLockError(null);
    const error = await lockDateWindow(view.session_id, token, blockIndex);
    if (error) {
      setLockError(error);
      setLocking(null);
      return;
    }
    // Refetch rather than patch locally — a successful lock also flips
    // everyone else's can_pick/waiting_on_higher_priority server-side,
    // but this view only knows its own; a fresh fetch is the simplest
    // way to get this person's post-lock state exactly right.
    const fresh = await fetchActorView(token);
    setView(fresh);
    setLocking(null);
  }

  async function handleConfirm(dayNumber: number) {
    setConfirming(dayNumber);
    const ok = await confirmDay(token, dayNumber);
    if (ok) {
      setView((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) =>
                d.day_number === dayNumber ? { ...d, confirmed: true } : d
              ),
            }
          : prev
      );
    }
    setConfirming(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f3] text-sm text-black/60">
        Loading...
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-6 text-center text-sm text-black/60">
        This link isn&apos;t valid, or the schedule hasn&apos;t been shared yet.
      </div>
    );
  }

  const firstName = view.actor_name.split(" ")[0];
  const undated = view.days.filter((d) => !d.date);
  const dated = view.days.filter((d) => d.date);

  return (
    <div className="min-h-screen bg-[#f5f5f3] px-6 py-16 text-[#000000]">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-black/50">{view.project_name}</div>
        <h1 className="mt-1 text-2xl font-bold">Hi {firstName},</h1>
        <p className="mt-2 text-sm text-black/70">
          {undated.length > 0
            ? "We haven't locked in dates yet. For every day below, give us at least 3 dates that work for you so we can plan around everyone."
            : "Here are the days you're currently scheduled for. Confirm each one, or let us know as soon as possible if any won't work."}
        </p>

        {view.window?.locked_block && (
          <div className="mt-6 rounded-lg border border-mint/40 bg-mint/10 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-ink">
              Shoot dates locked
            </div>
            <p className="mt-1 text-sm text-ink">{blockLabel(view.window.locked_block)}</p>
          </div>
        )}

        {view.window?.can_pick && (
          <div className="mt-6 rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <p className="text-sm font-medium">
              Pick your {view.window.num_shoot_days}-day shoot window
            </p>
            <p className="mt-1 text-xs text-black/60">
              You&apos;re first in line — whichever block you pick locks in for everyone else too,
              so choose the one that actually works.
            </p>
            <div className="mt-3 space-y-2">
              {view.window.candidate_blocks.map((block, i) => (
                <button
                  key={i}
                  onClick={() => handlePickBlock(i)}
                  disabled={locking !== null}
                  className="w-full rounded-md border border-black/15 bg-white px-4 py-2.5 text-left text-sm font-medium text-black/80 transition hover:border-black/30 hover:bg-black/5 disabled:opacity-50"
                >
                  {locking === i ? "Locking..." : blockLabel(block)}
                </button>
              ))}
            </div>
            {lockError && <p className="mt-2 text-[11px] text-coral">{lockError}</p>}
          </div>
        )}

        {view.window?.waiting_on_higher_priority && (
          <div className="mt-6 rounded-lg border border-black/10 bg-black/[0.02] p-4 text-xs text-black/60">
            Shoot dates aren&apos;t locked yet — waiting on someone with higher priority to pick a
            window first. Check back soon.
          </div>
        )}

        <div className="mt-6 divide-y divide-black/10">
          {view.days.map((d) => (
            <div key={d.day_number} className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">
                    Day {d.day_number}
                    {d.date && <span className="text-black/50"> · {d.date}</span>}
                  </div>
                  <div className="text-xs text-black/50">
                    {d.locations.join(", ")}
                    {d.hours_needed > 0 && ` · ~${d.hours_needed}h`}
                  </div>
                </div>

                {!d.date ? (
                  d.proposed_dates.length > 0 &&
                  openForm !== d.day_number && (
                    <button
                      onClick={() => setOpenForm(d.day_number)}
                      className="shrink-0 text-[10px] text-black/40 underline underline-offset-2 hover:text-black/60"
                    >
                      Update
                    </button>
                  )
                ) : d.cancelled ? (
                  <span className="shrink-0 rounded-full bg-coral/15 px-3 py-1 text-xs font-medium text-coral">
                    Marked unavailable
                  </span>
                ) : d.confirmed ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-medium text-ink">
                      Confirmed ✓
                    </span>
                    <button
                      onClick={() => setOpenForm(d.day_number)}
                      className="text-[10px] text-black/40 underline underline-offset-2 hover:text-black/60"
                    >
                      Actually, I can&apos;t make it
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleConfirm(d.day_number)}
                      disabled={confirming === d.day_number}
                      className="rounded-full bg-[#000000] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {confirming === d.day_number ? "Sending..." : "I can make it"}
                    </button>
                    <button
                      onClick={() => setOpenForm(d.day_number)}
                      disabled={openForm === d.day_number}
                      className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:border-black/30 hover:bg-black/5 disabled:opacity-50"
                    >
                      Can&apos;t make it
                    </button>
                  </div>
                )}
              </div>

              {d.proposed_dates.length > 0 && openForm !== d.day_number && (
                <p className="mt-2 text-[11px] text-black/50">
                  {!d.date
                    ? `You told us: ${d.proposed_dates.join(", ")} — we'll follow up once a date is set.`
                    : `You proposed: ${d.proposed_dates.join(", ")} — we'll follow up once a new date is set.`}
                </p>
              )}

              {!d.date && d.proposed_dates.length === 0 && openForm !== d.day_number && (
                <ProposeForm
                  label={`Give us at least ${MIN_DATES} dates you're free for Day ${d.day_number}.`}
                  submitLabel={(count) => `Submit ${count}/${MIN_DATES}+ dates`}
                  onSubmit={(dates) => handlePropose(d.day_number, dates, false)}
                />
              )}

              {openForm === d.day_number && (
                <ProposeForm
                  label={
                    d.date
                      ? `Give us at least ${MIN_DATES} dates you ARE free for this shoot — the more options, the better chance we find one that works for everyone.`
                      : `Update your availability for Day ${d.day_number} — give us at least ${MIN_DATES} dates.`
                  }
                  submitLabel={(count) => `Submit ${count}/${MIN_DATES}+ dates`}
                  onSubmit={(dates) => handlePropose(d.day_number, dates, !!d.date)}
                  onCancel={() => setOpenForm(null)}
                />
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-black/40">
          {dated.length > 0
            ? "Marking a day unavailable notifies the production team so they can adjust the schedule — it doesn't need approval from you again."
            : "Submitting your availability notifies the production team right away — no need to wait for a reply."}
        </p>
      </div>
    </div>
  );
}
