import StageHeader from "./StageHeader";
import { Schedule, ScheduleAttemptDay, ShootDay } from "@/lib/types";

function daySummary(day: ScheduleAttemptDay | ShootDay): string {
  return `Day ${day.day_number} (${day.locations.join(", ")}) → Scenes ${day.scenes.join(", ")}`;
}

export default function ValidatorSection({ schedule }: { schedule: Schedule }) {
  const retried = !!schedule.first_attempt;

  return (
    <div>
      <StageHeader
        index={3}
        title="Schedule Validator"
        description="A plain function, not a model — checks for hard violations. If it finds one, the Scheduling Agent has to fix it and gets checked again."
      />

      {retried && schedule.first_attempt ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-edge bg-panel p-5">
            <div className="tracked mb-3 text-[10px] text-faint uppercase">
              Scheduling Agent Proposes
            </div>
            <div className="space-y-1 font-mono text-xs text-dim">
              {schedule.first_attempt.shoot_days.map((d) => (
                <div key={d.day_number}>{daySummary(d)}</div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-edge/60 pt-3">
              {schedule.first_attempt.issues.map((issue, i) => (
                <p
                  key={i}
                  className={`text-xs ${
                    issue.severity === "error" ? "text-red-700" : "text-amber"
                  }`}
                >
                  {issue.day_number !== null ? `Day ${issue.day_number}: ` : ""}
                  {issue.message}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
            <div className="tracked mb-3 text-[10px] uppercase text-accent">
              {schedule.valid ? "✓ Corrected — All Blocking Issues Resolved" : "Still Has Issues"}
            </div>
            <div className="space-y-1 font-mono text-xs text-dim">
              {schedule.shoot_days.map((d) => (
                <div key={d.day_number}>{daySummary(d)}</div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-faint">Resolved on retry 1 of 2 max</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
          <div className="tracked mb-2 text-[10px] uppercase text-accent">
            ✓ All Constraints Satisfied
          </div>
          <p className="text-sm text-dim">
            The first proposed schedule passed validation — no retry was needed.
          </p>
        </div>
      )}

      {schedule.validator_issues.filter((i) => i.severity === "warning").length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="tracked text-[10px] text-faint uppercase">
            Remaining Warnings (non-blocking)
          </div>
          {schedule.validator_issues
            .filter((i) => i.severity === "warning")
            .map((issue, i) => (
              <p
                key={i}
                className="rounded-md border-l-2 border-amber/60 bg-amber/10 px-3 py-2 text-xs text-amber"
              >
                {issue.day_number !== null ? `Day ${issue.day_number}: ` : ""}
                {issue.message}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
