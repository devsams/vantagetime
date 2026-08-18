"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import { buildGoogleCalendarUrl, castNamesForDay } from "@/lib/calendar";
import { Breakdown, CrewMember, Schedule } from "@/lib/types";

function newCrewId() {
  return `crew_${Math.random().toString(36).slice(2, 9)}`;
}

export default function CalendarSyncSection({
  projectName,
  breakdown,
  schedule,
  castEmails,
  crew,
  onUpdateCastEmails,
  onUpdateCrew,
}: {
  projectName: string;
  breakdown: Breakdown;
  schedule: Schedule;
  castEmails: Record<string, string>;
  crew: CrewMember[];
  onUpdateCastEmails: (emails: Record<string, string>) => void;
  onUpdateCrew: (crew: CrewMember[]) => void;
}) {
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");
  const [newCrewEmail, setNewCrewEmail] = useState("");

  const datedDays = schedule.shoot_days.filter((d) => d.date);

  function setCastEmail(name: string, email: string) {
    onUpdateCastEmails({ ...castEmails, [name]: email });
  }

  function addCrewMember() {
    if (!newCrewName.trim() || !newCrewEmail.trim()) return;
    onUpdateCrew([
      ...crew,
      { id: newCrewId(), name: newCrewName.trim(), role: newCrewRole.trim(), email: newCrewEmail.trim() },
    ]);
    setNewCrewName("");
    setNewCrewRole("");
    setNewCrewEmail("");
  }

  function removeCrewMember(id: string) {
    onUpdateCrew(crew.filter((c) => c.id !== id));
  }

  return (
    <div>
      <StageHeader
        index={7}
        title="Calendar Sync"
        description="No OAuth, no email service — add cast and crew emails below, then open each shoot day as a pre-filled Google Calendar event. Saving it in your own Google account sends real invites; RSVPs happen through Calendar itself."
      />

      {datedDays.length === 0 && (
        <div className="mb-6 rounded-md border-l-2 border-accent/40 bg-accent/10 px-4 py-3 text-sm text-dim">
          Set a shoot window on the Scheduling tab first — calendar links only appear for days with a real date.
        </div>
      )}

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Cast Emails</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {breakdown.cast.map((member) => (
            <label key={member.name} className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">{member.name}</span>
              <input
                type="email"
                placeholder="actor@example.com"
                value={castEmails[member.name] ?? ""}
                onChange={(e) => setCastEmail(member.name, e.target.value)}
                className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <div className="tracked mb-3 text-[10px] text-faint uppercase">Crew Roster</div>
        {crew.length > 0 && (
          <div className="mb-3 space-y-2">
            {crew.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border border-edge/60 bg-panel2 px-3 py-2"
              >
                <div className="text-xs text-ink">
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-dim"> · {c.role}</span>}
                  <span className="text-faint"> · {c.email}</span>
                </div>
                <button
                  onClick={() => removeCrewMember(c.id)}
                  className="tracked text-[10px] text-faint uppercase transition hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-faint">Name</span>
            <input
              value={newCrewName}
              onChange={(e) => setNewCrewName(e.target.value)}
              className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-faint">Role</span>
            <input
              placeholder="Gaffer, DP, Sound..."
              value={newCrewRole}
              onChange={(e) => setNewCrewRole(e.target.value)}
              className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-faint">Email</span>
            <input
              type="email"
              placeholder="crew@example.com"
              value={newCrewEmail}
              onChange={(e) => setNewCrewEmail(e.target.value)}
              className="rounded-md border border-edge bg-panel2 px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <button
            onClick={addCrewMember}
            disabled={!newCrewName.trim() || !newCrewEmail.trim()}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
          >
            Add crew member
          </button>
        </div>
      </div>

      {datedDays.length > 0 && (
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
                  {castOnDay.map((name) => (
                    <span key={name} className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim">
                      {name}
                    </span>
                  ))}
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
