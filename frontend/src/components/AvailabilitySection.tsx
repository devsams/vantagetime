"use client";

import { useEffect, useState } from "react";
import StageHeader from "./StageHeader";
import { fetchCancellations, registerAvailabilityLinks } from "@/lib/api";
import { Cancellation, CastOutreach, ProposedPeriod } from "@/lib/types";

export default function AvailabilitySection({
  castOutreach,
  sessionId,
  projectName,
  availabilityLinks,
  proposedPeriod,
  onLinksGenerated,
  onRequestReschedule,
}: {
  castOutreach: CastOutreach;
  sessionId: string;
  projectName: string;
  availabilityLinks: Record<string, string>;
  proposedPeriod: ProposedPeriod | null;
  onLinksGenerated: (links: Record<string, string>) => void;
  onRequestReschedule: (text: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [checking, setChecking] = useState(false);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  async function checkCancellations() {
    setChecking(true);
    const result = await fetchCancellations(sessionId);
    setCancellations(result);
    setChecking(false);
  }

  useEffect(() => {
    checkCancellations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleGenerateLinks() {
    setGenerating(true);
    try {
      const links = await registerAvailabilityLinks(
        sessionId,
        projectName,
        castOutreach.cast_outreach.map((c) => ({
          name: c.name,
          scheduled_days: c.scheduled_days,
        })),
        proposedPeriod
      );
      onLinksGenerated(links);
    } catch {
      // Registration failing just means links stay ungenerated — the
      // draft content is still fully visible either way.
    }
    setGenerating(false);
  }

  function copyEmail(entry: CastOutreach["cast_outreach"][number], link?: string) {
    const body = link
      ? `${entry.email_body}\n\nLet us know here: ${window.location.origin}/availability/${link}`
      : entry.email_body;
    navigator.clipboard.writeText(`Subject: ${entry.email_subject}\n\n${body}`);
    setCopiedName(entry.name);
    setTimeout(() => setCopiedName(null), 1500);
  }

  return (
    <div>
      <StageHeader
        index={8}
        title="Availability Agent"
        description={
          proposedPeriod
            ? `Drafts a personal outreach message per cast member with their scheduled days. Proposed shooting period: ${proposedPeriod.start} to ${proposedPeriod.end} (set on the Planning tab). Links are simulated — nothing is actually emailed — but the actor-facing page behind each link is real, so you can demo the full loop.`
            : "Drafts a personal outreach message per cast member with their scheduled days. Links are simulated — nothing is actually emailed — but the actor-facing page behind each link is real, so you can demo the full loop."
        }
        action={
          <button
            onClick={handleGenerateLinks}
            disabled={generating}
            className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {generating ? "Generating..." : "↻ Generate links"}
          </button>
        }
      />

      {cancellations.length > 0 && (
        <div className="mb-6 space-y-2">
          {cancellations.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              <span>
                ⚠ {c.actor_name} marked Day {c.day_number} as unavailable.
              </span>
              <button
                onClick={() =>
                  onRequestReschedule(
                    `${c.actor_name} is no longer available on Day ${c.day_number} — please reschedule around this.`
                  )
                }
                className="shrink-0 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 transition hover:bg-red-500/30"
              >
                Draft reschedule request
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <button
          onClick={checkCancellations}
          disabled={checking}
          className="tracked text-[10px] text-faint uppercase transition hover:text-dim"
        >
          {checking ? "Checking..." : "↻ Check for responses"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {castOutreach.cast_outreach.map((entry) => {
          const token = availabilityLinks[entry.name];
          return (
            <div key={entry.name} className="rounded-xl border border-edge bg-panel p-5">
              <div className="flex items-center justify-between">
                <h3
                  className="text-lg uppercase leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {entry.name}
                </h3>
                <span className="tracked rounded-full bg-panel2 px-2 py-0.5 text-[9px] uppercase text-faint">
                  {entry.role_size}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.scheduled_days.map((d) => (
                  <span
                    key={d.day_number}
                    className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim"
                  >
                    Day {d.day_number} · {d.date || "date TBD"} · {d.hours_needed}h ·{" "}
                    {d.locations.join(", ")}
                  </span>
                ))}
              </div>

              <div className="mt-3 rounded-md border border-edge/60 bg-panel2 p-3">
                <div className="text-xs font-medium text-ink">{entry.email_subject}</div>
                <p className="mt-1 text-xs text-dim">{entry.email_body}</p>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => copyEmail(entry, token)}
                  className="tracked text-[10px] text-faint uppercase transition hover:text-accent"
                >
                  {copiedName === entry.name ? "Copied!" : "Copy email"}
                </button>
                {token ? (
                  <a
                    href={`/availability/${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tracked text-[10px] text-accent uppercase transition hover:brightness-125"
                  >
                    Open actor link →
                  </a>
                ) : (
                  <span className="tracked text-[10px] text-faint uppercase">
                    Generate links to get a shareable page
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
