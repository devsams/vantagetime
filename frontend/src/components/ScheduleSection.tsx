"use client";

import CalendarGrid from "./CalendarGrid";
import StageHeader from "./StageHeader";
import { Schedule } from "@/lib/types";

const RULES = [
  { label: "Location Rule", value: "One location per day by default" },
  { label: "Page Budget", value: "~5 pages / day for a small crew" },
  { label: "Magic Hour", value: "At most 1 golden-hour scene per day" },
];

export default function ScheduleSection({ schedule }: { schedule: Schedule }) {
  const hasDates = schedule.shoot_days.some((d) => d.date);

  return (
    <div>
      <StageHeader
        index={2}
        title="Scheduling Agent"
        description="Groups scenes by location, batches day/night scenes separately, and respects the rules below — then checks itself with a real validator."
        action={
          <span
            className={`tracked rounded-full border px-3 py-1.5 text-xs ${
              schedule.valid
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-red-500/40 bg-red-500/10 text-red-700"
            }`}
          >
            {schedule.valid ? "✓ validated schedule" : "has blocking issues"}
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {RULES.map((r) => (
          <div key={r.label} className="rounded-xl border border-edge bg-panel p-4">
            <div className="tracked text-[10px] text-faint uppercase">{r.label}</div>
            <div className="mt-1.5 text-sm text-ink">{r.value}</div>
          </div>
        ))}
      </div>

      {!hasDates && (
        <div className="mb-6 rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
          No shoot dates yet — set a shoot window in the Dates tab to assign real calendar dates.
        </div>
      )}
      {schedule.calendar_error && (
        <p className="mb-6 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-700">
          {schedule.calendar_error}
        </p>
      )}

      {hasDates ? (
        <CalendarGrid shootDays={schedule.shoot_days} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schedule.shoot_days.map((day) => (
            <div key={day.day_number} className="rounded-xl border border-edge bg-panel p-4">
              <div className="tracked text-[10px] text-faint uppercase">Day {day.day_number}</div>
              <div className="mt-1 text-sm font-medium text-accent">
                {day.locations.join(", ")}
              </div>
              <div className="mt-3 space-y-1 border-t border-edge/60 pt-3">
                {day.scenes.map((n) => (
                  <div key={n} className="text-xs text-dim">
                    SC {n}
                  </div>
                ))}
              </div>
              <div className="tracked mt-3 text-[10px] text-faint">{day.total_pages} pages</div>
              {day.call_time_note && (
                <p className="mt-2 text-xs text-dim">{day.call_time_note}</p>
              )}
              {day.cast_hours.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge/60 pt-3">
                  {day.cast_hours.map((c) => (
                    <span
                      key={c.name}
                      className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim"
                    >
                      {c.name} · {c.hours_needed}h
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
