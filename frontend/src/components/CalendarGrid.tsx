import { ShootDay } from "@/lib/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseISODate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

export default function CalendarGrid({ shootDays }: { shootDays: ShootDay[] }) {
  const dated = shootDays
    .filter((d) => d.date)
    .map((d) => ({ ...d, parsed: parseISODate(d.date) }));

  if (dated.length === 0) return null;

  const byMonth = new Map<string, typeof dated>();
  for (const d of dated) {
    const key = `${d.parsed.year}-${d.parsed.month}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(d);
  }
  const monthKeys = Array.from(byMonth.keys()).sort();
  const flagged = dated.filter((d) => d.weather_flag);

  return (
    <div>
      <div className="space-y-8">
        {monthKeys.map((key) => {
          const [yearStr, monthStr] = key.split("-");
          const year = Number(yearStr);
          const month = Number(monthStr);
          const days = byMonth.get(key)!;
          const dayByDate = new Map(days.map((d) => [d.parsed.day, d]));

          const startWeekday = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells: (number | null)[] = [
            ...Array(startWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div key={key}>
              <div className="tracked mb-3 text-xs text-dim uppercase">
                {MONTH_LABELS[month]} {year}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((w) => (
                  <div
                    key={w}
                    className="tracked pb-1 text-center text-[9px] text-faint uppercase"
                  >
                    {w}
                  </div>
                ))}
                {cells.map((dayNum, i) => {
                  if (dayNum === null) return <div key={i} />;
                  const shoot = dayByDate.get(dayNum);
                  return (
                    <div
                      key={i}
                      className={`min-h-[76px] rounded-lg border p-1.5 text-left ${
                        shoot ? "border-accent/50 bg-accent/10" : "border-edge/60 bg-panel2"
                      }`}
                    >
                      <div className={`text-[10px] ${shoot ? "text-accent" : "text-faint"}`}>
                        {dayNum}
                      </div>
                      {shoot && (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-[10px] font-medium text-ink">
                            Day {shoot.day_number}
                          </div>
                          <div className="truncate text-[9px] text-dim">
                            {(shoot.locations ?? []).join(", ")}
                          </div>
                          {shoot.weather_flag && (
                            <div className="text-[9px] text-amber" title={shoot.weather_flag}>
                              ⚠ weather
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {flagged.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="tracked text-[10px] text-faint uppercase">Weather Notes</div>
          {flagged.map((d) => (
            <p
              key={d.day_number}
              className="rounded-md border-l-2 border-amber/60 bg-amber/10 px-3 py-2 text-xs text-amber"
            >
              Day {d.day_number} ({d.date}): {d.weather_flag}
            </p>
          ))}
        </div>
      )}

      {dated.some((d) => (d.cast_hours ?? []).length > 0) && (
        <div className="mt-6 space-y-2">
          <div className="tracked text-[10px] text-faint uppercase">Cast Hours</div>
          {dated
            .filter((d) => (d.cast_hours ?? []).length > 0)
            .map((d) => (
              <div key={d.day_number} className="rounded-md border border-edge/60 bg-panel2 px-3 py-2">
                <div className="text-xs text-ink">
                  Day {d.day_number} ({d.date})
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(d.cast_hours ?? []).map((c) => (
                    <span key={c.name} className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-dim">
                      {c.name} · {c.hours_needed}h
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
