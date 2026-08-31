"use client";

import { use, useEffect, useState } from "react";
import { confirmLocationDay, declineLocationDay, fetchLocationView } from "@/lib/api";
import { LocationView } from "@/lib/types";

export default function LocationConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<LocationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [declining, setDeclining] = useState<number | null>(null);
  const [declineNote, setDeclineNote] = useState<Record<number, string>>({});
  const [showDeclineForm, setShowDeclineForm] = useState<number | null>(null);

  useEffect(() => {
    fetchLocationView(token).then((v) => {
      setView(v);
      setLoading(false);
    });
  }, [token]);

  async function handleConfirm(dayNumber: number) {
    setConfirming(dayNumber);
    const ok = await confirmLocationDay(token, dayNumber);
    if (ok) {
      setView((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) =>
                d.day_number === dayNumber ? { ...d, confirmed: true, declined: false } : d
              ),
            }
          : prev
      );
    }
    setConfirming(null);
  }

  async function handleDecline(dayNumber: number) {
    setDeclining(dayNumber);
    const ok = await declineLocationDay(token, dayNumber, declineNote[dayNumber] ?? "");
    if (ok) {
      setView((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) =>
                d.day_number === dayNumber ? { ...d, declined: true, confirmed: false } : d
              ),
            }
          : prev
      );
      setShowDeclineForm(null);
    }
    setDeclining(null);
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

  const undated = view.days.filter((d) => !d.date);
  const dated = view.days.filter((d) => d.date);

  return (
    <div className="min-h-screen bg-[#f5f5f3] px-6 py-16 text-[#000000]">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-black/50">{view.project_name}</div>
        <h1 className="mt-1 text-2xl font-bold">Hi, {view.location_name}</h1>
        <p className="mt-2 text-sm text-black/70">
          {undated.length > 0 && dated.length === 0
            ? "We're planning to film here, but exact dates aren't locked in yet. Check back once they are, or let us know now if there's anything we should plan around."
            : "Here's when we're planning to film at your location. Confirm each day, or let us know as soon as possible if one won't work."}
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
                  {d.hours_needed > 0 && <div className="text-xs text-black/50">~{d.hours_needed}h</div>}
                </div>

                {!d.date ? (
                  <span className="shrink-0 rounded-full border border-black/10 px-3 py-1 text-xs text-black/50">
                    Date TBD
                  </span>
                ) : d.declined ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-coral/15 px-3 py-1 text-xs font-medium text-coral">
                      Marked unavailable
                    </span>
                    <button
                      onClick={() => handleConfirm(d.day_number)}
                      className="text-[10px] text-black/40 underline underline-offset-2 hover:text-black/60"
                    >
                      Actually, this works
                    </button>
                  </div>
                ) : d.confirmed ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-medium text-ink">
                      Confirmed ✓
                    </span>
                    <button
                      onClick={() => setShowDeclineForm(d.day_number)}
                      className="text-[10px] text-black/40 underline underline-offset-2 hover:text-black/60"
                    >
                      Actually, this won&apos;t work
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleConfirm(d.day_number)}
                      disabled={confirming === d.day_number}
                      className="rounded-full bg-[#000000] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {confirming === d.day_number ? "Sending..." : "This works"}
                    </button>
                    <button
                      onClick={() => setShowDeclineForm(d.day_number)}
                      disabled={showDeclineForm === d.day_number}
                      className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:border-black/30 hover:bg-black/5 disabled:opacity-50"
                    >
                      Won&apos;t work
                    </button>
                  </div>
                )}
              </div>

              {showDeclineForm === d.day_number && (
                <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                  <p className="text-xs text-black/70">
                    Anything we should know? (booked, permit issue, noise restriction, etc.)
                  </p>
                  <textarea
                    value={declineNote[d.day_number] ?? ""}
                    onChange={(e) => setDeclineNote((prev) => ({ ...prev, [d.day_number]: e.target.value }))}
                    rows={3}
                    placeholder="Optional — helps us plan around it"
                    className="mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs text-black/80 placeholder:text-black/30 focus:border-black/40 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleDecline(d.day_number)}
                      disabled={declining === d.day_number}
                      className="rounded-full bg-[#000000] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      {declining === d.day_number ? "Sending..." : "Send"}
                    </button>
                    <button
                      onClick={() => setShowDeclineForm(null)}
                      disabled={declining === d.day_number}
                      className="text-[11px] text-black/50 underline underline-offset-2 hover:text-black/70"
                    >
                      Never mind
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-black/40">
          Confirming or marking a day unavailable notifies the production team right away — no need to wait for a
          reply.
        </p>
      </div>
    </div>
  );
}
