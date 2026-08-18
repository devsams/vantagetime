import StageHeader from "./StageHeader";
import { Breakdown, LocationResearch } from "@/lib/types";

function relativeTime(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function LocationsSection({
  locationResearch,
  breakdown,
  updatedAt,
}: {
  locationResearch: Record<number, LocationResearch>;
  breakdown: Breakdown | null;
  updatedAt: number | null;
}) {
  const slots = Object.entries(locationResearch)
    .map(([slot, r]) => ({ slot: Number(slot), r }))
    .filter(({ r }) => r.assigned)
    .sort((a, b) => a.slot - b.slot);

  return (
    <div>
      <StageHeader
        index={4}
        title="Location Research Agent"
        description="Fires a live search per unique location, all at once — permit rules and restrictions as they stand today. Set each location's available days, dates, and priority on the Planning tab."
      />

      {slots.length === 0 ? (
        <div className="rounded-xl border border-edge bg-panel p-6 text-sm text-faint">
          No location research yet — mention a real shoot city/region so the agents know where to
          search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map(({ slot, r }) => {
            const intExt = breakdown?.locations.find((l) => l.name === r.location_name)?.int_ext;
            const notes = [
              r.permit_notes,
              r.weather_notes,
              r.logistics_notes,
            ].filter(Boolean);

            return (
              <div key={slot} className="rounded-xl border border-edge bg-panel p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className="text-lg uppercase leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {r.location_name}
                  </h3>
                  <span
                    className={`tracked shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase ${
                      r.research_blocked
                        ? "bg-red-500/15 text-red-300"
                        : "bg-panel2 text-faint"
                    }`}
                  >
                    {r.research_blocked ? "Blocked" : intExt ?? "—"}
                  </span>
                </div>

                {r.research_blocked ? (
                  <p className="mt-3 text-xs text-dim">{r.logistics_notes}</p>
                ) : (
                  <div className="mt-3 divide-y divide-edge/60">
                    {notes.map((note, i) => (
                      <p key={i} className="py-2 text-xs text-dim first:pt-0 last:pb-0">
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {r.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge/60 pt-3">
                    {r.sources.slice(0, 3).map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-edge px-2 py-0.5 text-[9px] text-faint transition hover:border-accent hover:text-accent"
                      >
                        {s.title || s.url}
                      </a>
                    ))}
                  </div>
                )}

                <div className="tracked mt-3 text-[9px] text-faint">
                  via Parallel{updatedAt ? ` · updated ${relativeTime(updatedAt)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
