"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import {
  buildTimeCardsCsv,
  computeHoursWorked,
  computePay,
  downloadTimeCardsCsv,
  emptyPayRate,
  emptyTimeCard,
  formatCurrency,
} from "@/lib/timecards";
import { CastMember, CrewMember, PayRate, ShootDay, TimeCard, TimeCardStatus } from "@/lib/types";

interface Person {
  name: string;
  type: "Cast" | "Crew";
}

/** Every cast/crew member's real logged hours and computed pay, day by
 * day — the one thing missing that turns a schedule into something a
 * payroll provider can actually use. Rates are entered once per person
 * (Pay Rates below); every day's hours are logged against that same
 * rate, so a call/wrap edit anywhere recalculates that person's pay
 * immediately, no separate "recalculate" step. */
export default function TimeCardsSection({
  projectName,
  cast,
  crew,
  shootDays,
  timeCards,
  payRates,
  onUpdateTimeCards,
  onUpdatePayRates,
}: {
  projectName: string;
  cast: CastMember[];
  crew: CrewMember[];
  shootDays: ShootDay[];
  timeCards: TimeCard[];
  payRates: Record<string, PayRate>;
  onUpdateTimeCards: (timeCards: TimeCard[]) => void;
  onUpdatePayRates: (payRates: Record<string, PayRate>) => void;
}) {
  const [showRates, setShowRates] = useState(true);

  const people: Person[] = [
    ...cast.map((c) => ({ name: c.name, type: "Cast" as const })),
    ...crew.map((c) => ({ name: c.name, type: "Crew" as const })),
  ];

  function rateFor(name: string): PayRate {
    return payRates[name] ?? emptyPayRate("day");
  }

  function patchRate(name: string, patch: Partial<PayRate>) {
    onUpdatePayRates({ ...payRates, [name]: { ...rateFor(name), ...patch } });
  }

  function cardFor(dayNumber: number, name: string): TimeCard | undefined {
    return timeCards.find((tc) => tc.dayNumber === dayNumber && tc.personName === name);
  }

  function ensureCard(dayNumber: number, person: Person): TimeCard {
    const existing = cardFor(dayNumber, person.name);
    if (existing) return existing;
    const created = emptyTimeCard(dayNumber, person.name, person.type);
    onUpdateTimeCards([...timeCards, created]);
    return created;
  }

  function patchCard(id: string, patch: Partial<TimeCard>) {
    onUpdateTimeCards(timeCards.map((tc) => (tc.id === id ? { ...tc, ...patch, updatedAt: Date.now() } : tc)));
  }

  function removeCard(id: string) {
    onUpdateTimeCards(timeCards.filter((tc) => tc.id !== id));
  }

  function toggleStatus(tc: TimeCard) {
    const next: TimeCardStatus = tc.status === "approved" ? "pending" : "approved";
    patchCard(tc.id, { status: next });
  }

  const shootDayDates: Record<number, string> = Object.fromEntries(shootDays.map((d) => [d.day_number, d.date]));

  // Every time card's real pay, summed — the total labor cost line.
  const totalLaborCost = timeCards.reduce((sum, tc) => {
    const hours = computeHoursWorked(tc.callTime, tc.wrapTime, tc.mealBreakMinutes);
    return sum + computePay(hours, payRates[tc.personName]).totalPay;
  }, 0);
  const approvedCount = timeCards.filter((tc) => tc.status === "approved").length;

  function handleExport() {
    const csv = buildTimeCardsCsv(timeCards, payRates, shootDayDates);
    downloadTimeCardsCsv(projectName, csv);
  }

  return (
    <div>
      <StageHeader
        index={7}
        title="Time Cards"
        description="Real call/wrap times per person per shoot day, priced against a rate you set once — regular, overtime, and double-time split out automatically. Export the whole thing straight to your payroll provider."
        meta={
          timeCards.length > 0
            ? `${timeCards.length} time card${timeCards.length === 1 ? "" : "s"} · ${approvedCount} approved · ${formatCurrency(totalLaborCost)} total labor cost`
            : undefined
        }
        action={
          <button
            onClick={handleExport}
            disabled={timeCards.length === 0}
            className="btn-poster rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            ↓ Export CSV
          </button>
        }
      />

      {people.length === 0 ? (
        <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
          No cast or crew on the roster yet — add people in the Members tab first.
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <button
              onClick={() => setShowRates((v) => !v)}
              className="tracked flex w-full items-center justify-between text-[10px] text-faint uppercase"
            >
              <span>
                Pay Rates ({people.filter((p) => (payRates[p.name]?.rate ?? 0) > 0).length} of {people.length} set)
              </span>
              <span>{showRates ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {showRates && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-edge text-left text-[10px] uppercase tracked text-faint">
                      <th className="py-1.5 pr-2">Person</th>
                      <th className="py-1.5 pr-2">Basis</th>
                      <th className="py-1.5 pr-2">Rate</th>
                      <th className="py-1.5 pr-2">Standard hrs</th>
                      <th className="py-1.5 pr-2">2x OT after</th>
                      <th className="py-1.5 pr-2">OT ×</th>
                      <th className="py-1.5 pr-2">2x OT ×</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => {
                      const rate = rateFor(p.name);
                      const isSet = !!payRates[p.name];
                      return (
                        <tr key={p.name} className="border-b border-edge/60 last:border-b-0">
                          <td className="py-1.5 pr-2 font-medium text-ink">
                            {p.name}
                            <span className="ml-1 text-[9px] text-faint">{p.type}</span>
                          </td>
                          <td className="py-1.5 pr-2">
                            <select
                              value={rate.basis}
                              onChange={(e) => {
                                const basis = e.target.value as PayRate["basis"];
                                patchRate(p.name, isSet ? { basis } : emptyPayRate(basis));
                              }}
                              className="rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                            >
                              <option value="day">Day rate</option>
                              <option value="hourly">Hourly</option>
                            </select>
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={rate.rate || ""}
                              onChange={(e) => patchRate(p.name, { rate: Number(e.target.value) || 0 })}
                              placeholder="0.00"
                              className="w-24 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              min={1}
                              value={rate.standardHours}
                              onChange={(e) => patchRate(p.name, { standardHours: Number(e.target.value) || 1 })}
                              className="w-16 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              min={1}
                              value={rate.otThresholdHours}
                              onChange={(e) => patchRate(p.name, { otThresholdHours: Number(e.target.value) || 1 })}
                              className="w-16 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              min={1}
                              step={0.1}
                              value={rate.otMultiplier}
                              onChange={(e) => patchRate(p.name, { otMultiplier: Number(e.target.value) || 1 })}
                              className="w-14 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              min={1}
                              step={0.1}
                              value={rate.doubleOtMultiplier}
                              onChange={(e) => patchRate(p.name, { doubleOtMultiplier: Number(e.target.value) || 1 })}
                              className="w-14 rounded-md border border-edge bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {shootDays.length === 0 ? (
            <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
              No shoot days yet — set a shoot window in the Production Plan tab before logging time cards.
            </div>
          ) : (
            <div className="space-y-6">
              {shootDays.map((day) => (
                <div key={day.day_number} className="rounded-xl border border-edge bg-panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="tracked text-[10px] text-faint uppercase">Day {day.day_number}</div>
                    {day.date && <div className="text-xs font-medium text-accent">{day.date}</div>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-edge text-left text-[10px] uppercase tracked text-faint">
                          <th className="py-1.5 pr-2">Person</th>
                          <th className="py-1.5 pr-2">Call</th>
                          <th className="py-1.5 pr-2">Wrap</th>
                          <th className="py-1.5 pr-2">Meal (min)</th>
                          <th className="py-1.5 pr-2">Hours</th>
                          <th className="py-1.5 pr-2">Pay</th>
                          <th className="py-1.5 pr-2">Status</th>
                          <th className="py-1.5 pr-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((p) => {
                          const tc = cardFor(day.day_number, p.name);
                          const hours = tc ? computeHoursWorked(tc.callTime, tc.wrapTime, tc.mealBreakMinutes) : 0;
                          const pay = computePay(hours, payRates[p.name]);
                          if (!tc) {
                            return (
                              <tr key={p.name} className="border-b border-edge/60 last:border-b-0">
                                <td className="py-1.5 pr-2 text-dim">{p.name}</td>
                                <td colSpan={6} className="py-1.5 pr-2 text-faint">
                                  Not logged
                                </td>
                                <td className="py-1.5 pr-2">
                                  <button
                                    onClick={() => ensureCard(day.day_number, p)}
                                    className="tracked text-[10px] text-accent uppercase transition hover:brightness-125"
                                  >
                                    + Log time
                                  </button>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={p.name} className="border-b border-edge/60 last:border-b-0">
                              <td className="py-1.5 pr-2 font-medium text-ink">{p.name}</td>
                              <td className="py-1.5 pr-2">
                                <input
                                  type="time"
                                  value={tc.callTime}
                                  onChange={(e) => patchCard(tc.id, { callTime: e.target.value })}
                                  className="rounded-md border border-edge bg-panel2 px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input
                                  type="time"
                                  value={tc.wrapTime}
                                  onChange={(e) => patchCard(tc.id, { wrapTime: e.target.value })}
                                  className="rounded-md border border-edge bg-panel2 px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={tc.mealBreakMinutes}
                                  onChange={(e) =>
                                    patchCard(tc.id, { mealBreakMinutes: Number(e.target.value) || 0 })
                                  }
                                  className="w-16 rounded-md border border-edge bg-panel2 px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 pr-2 text-dim">{hours || "—"}</td>
                              <td className="py-1.5 pr-2 font-medium text-ink">
                                {pay.totalPay > 0 ? formatCurrency(pay.totalPay) : "—"}
                                {(pay.otHours > 0 || pay.doubleOtHours > 0) && (
                                  <div className="text-[9px] text-amber">
                                    {pay.otHours > 0 && `${pay.otHours}h OT`}
                                    {pay.otHours > 0 && pay.doubleOtHours > 0 && " · "}
                                    {pay.doubleOtHours > 0 && `${pay.doubleOtHours}h 2×OT`}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 pr-2">
                                <button
                                  onClick={() => toggleStatus(tc)}
                                  className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase transition ${
                                    tc.status === "approved"
                                      ? "border-mint/50 bg-mint/10 text-mint"
                                      : "border-edge text-faint hover:text-dim"
                                  }`}
                                >
                                  {tc.status === "approved" ? "✓ Approved" : "Pending"}
                                </button>
                              </td>
                              <td className="py-1.5 pr-2">
                                <button
                                  onClick={() => removeCard(tc.id)}
                                  title="Delete time card"
                                  className="text-sm text-faint transition hover:text-coral"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
