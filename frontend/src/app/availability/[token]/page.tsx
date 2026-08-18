"use client";

import { use, useEffect, useState } from "react";
import { confirmDay, fetchActorView, proposeDates } from "@/lib/api";
import { ActorView } from "@/lib/types";

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
        <p className="mt-2 text-[11px] text-red-600">Each date should be different.</p>
      )}
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="rounded-full bg-[#1a1a16] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
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
      <div className="flex min-h-screen items-center justify-center bg-[#f4f2ea] text-sm text-black/60">
        Loading...
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f2ea] px-6 text-center text-sm text-black/60">
        This link isn&apos;t valid, or the schedule hasn&apos;t been shared yet.
      </div>
    );
  }

  const firstName = view.actor_name.split(" ")[0];
  const undated = view.days.filter((d) => !d.date);
  const dated = view.days.filter((d) => d.date);

  return (
    <div className="min-h-screen bg-[#f4f2ea] px-6 py-16 text-[#1a1a16]">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-black/50">{view.project_name}</div>
        <h1 className="mt-1 text-2xl font-bold">Hi {firstName},</h1>
        <p className="mt-2 text-sm text-black/70">
          {undated.length > 0
            ? "We haven't locked in dates yet. For every day below, give us at least 3 dates that work for you so we can plan around everyone."
            : "Here are the days you're currently scheduled for. Confirm each one, or let us know as soon as possible if any won't work."}
        </p>

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
                  <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    Marked unavailable
                  </span>
                ) : d.confirmed ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
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
                      className="rounded-full bg-[#1a1a16] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
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
