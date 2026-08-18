"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import { buildGoogleCalendarUrl, castNamesForDay } from "@/lib/calendar";
import { fetchConfirmations } from "@/lib/api";
import { Breakdown, Confirmation, CrewMember, Schedule } from "@/lib/types";

export default function DatesSection({
  projectName,
  sessionId,
  breakdown,
  schedule,
  castEmails,
  crew,
  onSetShootWindow,
}: {
  projectName: string;
  sessionId: string;
  breakdown: Breakdown;
  schedule: Schedule;
  castEmails: Record<string, string>;
  crew: CrewMember[];
  onSetShootWindow: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);

  const datedDays = schedule.shoot_days.filter((d) => d.date);
  const confirmedSet = new Set(confirmations.map((c) => `${c.actor_name}|${c.day_number}`));

  useEffect(() => {
    fetchConfirmations(sessionId).then(setConfirmations);
  }, [sessionId]);

  return (
    <div>
      <StageHeader
        index={9}
        title="Dates"
        description="Once cast/crew availability has come back on the Planning tab, set the shoot window here to assign real calendar dates, then sync each day to Google Calendar."
      />

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Shoot Window</div>
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
          <button
            onClick={() => start && end && onSetShootWindow(start, end)}
            disabled={!start || !end}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
          >
            Assign dates
          </button>
        </div>
        {schedule.calendar_error && (
          <p className="mt-3 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {schedule.calendar_error}
          </p>
        )}
      </div>

      {datedDays.length === 0 ? (
        <div className="rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
          No shoot dates yet — set a window above once you've checked the Planning tab for the
          best overlap.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datedDays.map((day) => {
            const castOnDay = castNamesForDay(day, breakdown);
            const url = buildGoogleCalendarUrl({ projectName, day, breakdown, castEmails, crew });
            return (
              <div key={day.day_number} className="rounded-xl border border-edge bg-panel p-4">
                <div className="tracked text-[10px] text-faint uppercase">Day {day.day_number}</div>
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
    </div>
  );
}
