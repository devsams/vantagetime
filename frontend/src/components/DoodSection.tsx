"use client";

import { computeDood } from "@/lib/dood";
import { Breakdown, Schedule } from "@/lib/types";

/** Day-Out-Of-Days report — embedded inside the Production Plan tab as its own
 * sub-tab, no header of its own (same convention as ScheduleSection).
 * One row per cast member, one column per shoot day: W = work day, H =
 * hold (between their first and last work day but not shooting that
 * day), blank = outside their span entirely. Purely derived from the
 * current schedule — recalculates instantly after a Stripboard move,
 * since it reads the same schedule.shoot_days the Stripboard writes to. */
export default function DoodSection({ projectName, breakdown, schedule }: { projectName: string; breakdown: Breakdown; schedule: Schedule }) {
  const rows = computeDood(schedule, breakdown);
  const days = schedule.shoot_days;

  if (days.length === 0) {
    return (
      <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
        No shoot days yet — set a shoot window and let the schedule generate before a Day-Out-Of-Days
        report has anything to show.
      </div>
    );
  }

  return (
    <div id="dood-print-area">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-faint">
          Every cast member&apos;s work/hold days across the whole shoot — the document actors and
          their reps actually ask for.
        </p>
        <button
          onClick={() => window.print()}
          className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-faint transition hover:text-dim"
        >
          🖨 Print
        </button>
      </div>

      <div className="mb-2 hidden text-lg font-semibold text-ink print:block">
        {projectName} — Day-Out-Of-Days
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
          No cast assigned to any scheduled scene yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-edge bg-panel2">
                <th className="sticky left-0 z-10 bg-panel2 px-3 py-2 text-left text-[10px] uppercase tracked text-faint">
                  Cast
                </th>
                {days.map((d) => (
                  <th key={d.day_number} className="px-2 py-2 text-center text-[10px] uppercase tracked text-faint">
                    <div>Day {d.day_number}</div>
                    {d.date && <div className="mt-0.5 font-normal normal-case text-faint/80">{d.date}</div>}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[10px] uppercase tracked text-faint">Work</th>
                <th className="px-2 py-2 text-center text-[10px] uppercase tracked text-faint">Hold</th>
                <th className="px-2 py-2 text-center text-[10px] uppercase tracked text-faint">Span</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-edge/60 last:border-b-0">
                  <td className="sticky left-0 z-10 bg-panel px-3 py-2 font-medium text-ink">{row.name}</td>
                  {row.statuses.map((status, i) => (
                    <td key={i} className="px-2 py-2 text-center">
                      {status === "W" && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                          W
                        </span>
                      )}
                      {status === "H" && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-panel2 text-[10px] text-faint">
                          H
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-dim">{row.workDays}</td>
                  <td className="px-2 py-2 text-center text-dim">{row.holdDays}</td>
                  <td className="px-2 py-2 text-center text-dim">{row.spanDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex gap-4 text-[10px] text-faint">
        <span>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-accent">
            W
          </span>
          Work day
        </span>
        <span>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-panel2 text-faint">
            H
          </span>
          Hold — between their first and last work day, not shooting
        </span>
      </div>
    </div>
  );
}
