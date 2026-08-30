"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import NoteBullets from "./NoteBullets";
import { formatPageCount } from "@/lib/callSheetExtras";
import { CallSheets, LocationAvailability, ProductionInfo } from "@/lib/types";

const PRODUCTION_FIELDS: { key: keyof ProductionInfo; label: string }[] = [
  { key: "companyName", label: "Producing Company (legal entity)" },
  { key: "upmName", label: "UPM — Name" },
  { key: "upmPhone", label: "UPM — Phone" },
  { key: "firstAdName", label: "1st AD — Name" },
  { key: "firstAdPhone", label: "1st AD — Phone" },
  { key: "secondAdName", label: "2nd AD — Name" },
  { key: "secondAdPhone", label: "2nd AD — Phone" },
  { key: "crewCallPhone", label: "Crew Call — Phone" },
  { key: "safetyOfficerName", label: "Safety Officer — Name" },
  { key: "safetyOfficerPhone", label: "Safety Officer — Phone" },
  { key: "safetyHotline", label: "Safety Hotline" },
  { key: "medicName", label: "On-Set Medic — Name" },
  { key: "medicPhone", label: "On-Set Medic — Phone" },
  { key: "medicLocation", label: "On-Set Medic — Station Location" },
];

function formatDateLong(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CallSheetSection({
  callSheets,
  projectName,
  locationAvailability,
  productionInfo,
  onUpdateProductionInfo,
}: {
  callSheets: CallSheets;
  projectName: string;
  locationAvailability: Record<string, LocationAvailability>;
  productionInfo: ProductionInfo;
  onUpdateProductionInfo: (info: ProductionInfo) => void;
}) {
  const days = callSheets.call_sheets;
  const [activeDay, setActiveDay] = useState(days[0]?.day_number ?? 1);
  const [showProductionInfo, setShowProductionInfo] = useState(false);
  const day = days.find((d) => d.day_number === activeDay) ?? days[0];

  const totalPagesRaw = day?.scenes.reduce((sum, s) => sum + (s.page_count || 0), 0) ?? 0;
  const locationInfo = day ? locationAvailability[day.location.name] : undefined;
  const address = locationInfo?.address ?? "";
  const locationContact = [locationInfo?.contactName, locationInfo?.contactPhone, locationInfo?.contactEmail]
    .filter(Boolean)
    .join(" · ");

  function patchProductionInfo(patch: Partial<ProductionInfo>) {
    onUpdateProductionInfo({ ...productionInfo, ...patch });
  }

  return (
    <div>
      <StageHeader
        index={5}
        title="Call Sheet Generator"
        description="Structured formatting straight from the validated schedule. Day-specific to-dos — equipment, transport, parking, and the like — now live in Task Master, assigned to a real person."
      />

      <div className="mb-6 rounded-xl border border-edge bg-panel p-4">
        <button
          onClick={() => setShowProductionInfo((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="tracked text-[10px] text-faint uppercase">
            Production Info — applies to every call sheet day
          </span>
          <span className="text-xs text-faint">{showProductionInfo ? "Hide" : "Edit"}</span>
        </button>
        <p className="mt-1 text-xs text-faint">
          Company, key contacts, safety, and radio channels — these are production decisions with
          no source of truth in the script or schedule, so they're entered here once, not
          generated automatically.
        </p>
        {showProductionInfo && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRODUCTION_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">{f.label}</span>
                <input
                  type="text"
                  value={productionInfo[f.key]}
                  onChange={(e) => patchProductionInfo({ [f.key]: e.target.value })}
                  className="rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] text-faint">
                Walkie-Talkie Channel Map (e.g. &quot;Ch1: Main/ADs, Ch2: Open, Ch3: Camera, Ch8: Grip/Electric&quot;)
              </span>
              <textarea
                value={productionInfo.walkieChannels}
                onChange={(e) => patchProductionInfo({ walkieChannels: e.target.value })}
                rows={2}
                className="rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {days.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d.day_number}
              onClick={() => setActiveDay(d.day_number)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                d.day_number === activeDay
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-edge text-faint hover:border-dim hover:text-dim"
              }`}
            >
              Day {d.day_number}
            </button>
          ))}
        </div>
      )}

      {day && (
        <div className="rounded-2xl bg-panel p-8 text-ink shadow-sm">
          <div className="flex items-start justify-between border-b border-black/15 pb-4">
            <div>
              <h3 className="text-2xl font-bold uppercase leading-none">
                {projectName} — Call Sheet
              </h3>
              <p className="mt-1 text-xs text-black/60">
                Day {day.day_number} of {days.length}
                {day.date ? ` — ${formatDateLong(day.date)}` : " — date not yet set"}
              </p>
            </div>
            <div className="text-right text-xs text-black/70">
              <div>
                Location: <span className="font-semibold">{day.location.name}</span>
              </div>
              {address && <div className="mt-0.5 text-black/50">{address}</div>}
              {locationInfo?.mapsUrl && (
                <div className="mt-0.5">
                  <a
                    href={locationInfo.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    Open in Google Maps →
                  </a>
                </div>
              )}
              {locationContact && <div className="mt-0.5 text-black/50">Contact: {locationContact}</div>}
            </div>
          </div>

          {day.safety_notes && (
            <div className="mt-4 rounded-md bg-amber/15 px-4 py-3 text-xs text-ink">
              ⚠ {day.safety_notes}
            </div>
          )}
          {!day.safety_notes && day.call_time_note && (
            <div className="mt-4 rounded-md bg-amber/15 px-4 py-3 text-xs text-ink">
              {day.call_time_note}
            </div>
          )}

          {(day.weather_flag || day.sunrise || day.sunset) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-black/70">
              {day.weather_flag && <span>{day.weather_flag}</span>}
              {day.sunrise && <span>Sunrise {day.sunrise}</span>}
              {day.sunset && <span>Sunset {day.sunset}</span>}
            </div>
          )}

          {day.location.hours_notes && (
            <div className="mt-4 rounded-md border border-amber/20 bg-amber/5 px-4 py-3 text-xs text-black/80">
              <span className="font-semibold">Hours: </span>
              <NoteBullets text={day.location.hours_notes} max={2} className="mt-0.5" />
            </div>
          )}

          {(day.location.weather_notes || day.location.permit_notes) && (
            <div className="mt-2 space-y-1 text-xs text-black/60">
              {day.location.weather_notes && (
                <div>
                  <span className="font-semibold text-black/70">Weather notes: </span>
                  <NoteBullets text={day.location.weather_notes} max={3} className="mt-0.5" />
                </div>
              )}
              {day.location.permit_notes && (
                <div>
                  <span className="font-semibold text-black/70">Permits: </span>
                  <NoteBullets text={day.location.permit_notes} max={3} className="mt-0.5" />
                </div>
              )}
            </div>
          )}

          {(day.location.nearest_hospital ||
            day.location.emergency_contacts ||
            productionInfo.safetyOfficerName ||
            productionInfo.safetyHotline ||
            productionInfo.medicName) && (
            <div className="mt-4 rounded-md border border-coral/20 bg-coral/5 px-4 py-3 text-xs text-black/80">
              <div className="tracked mb-1 text-[10px] uppercase text-coral/70">
                Safety & Emergency
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {day.location.nearest_hospital && (
                  <div>
                    <span className="font-semibold">Nearest hospital: </span>
                    {day.location.nearest_hospital}
                  </div>
                )}
                {day.location.emergency_contacts && (
                  <div>
                    <span className="font-semibold">Police / fire: </span>
                    {day.location.emergency_contacts}
                  </div>
                )}
                {(productionInfo.safetyOfficerName || productionInfo.safetyOfficerPhone) && (
                  <div>
                    <span className="font-semibold">Safety officer: </span>
                    {[productionInfo.safetyOfficerName, productionInfo.safetyOfficerPhone]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {productionInfo.safetyHotline && (
                  <div>
                    <span className="font-semibold">Safety hotline: </span>
                    {productionInfo.safetyHotline}
                  </div>
                )}
                {(productionInfo.medicName || productionInfo.medicPhone || productionInfo.medicLocation) && (
                  <div className="sm:col-span-2">
                    <span className="font-semibold">On-set medic: </span>
                    {[productionInfo.medicName, productionInfo.medicPhone, productionInfo.medicLocation]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {(productionInfo.upmName ||
            productionInfo.firstAdName ||
            productionInfo.secondAdName ||
            productionInfo.crewCallPhone) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-black/70">
              {(productionInfo.upmName || productionInfo.upmPhone) && (
                <span>
                  UPM: {[productionInfo.upmName, productionInfo.upmPhone].filter(Boolean).join(" · ")}
                </span>
              )}
              {(productionInfo.firstAdName || productionInfo.firstAdPhone) && (
                <span>
                  1st AD:{" "}
                  {[productionInfo.firstAdName, productionInfo.firstAdPhone].filter(Boolean).join(" · ")}
                </span>
              )}
              {(productionInfo.secondAdName || productionInfo.secondAdPhone) && (
                <span>
                  2nd AD:{" "}
                  {[productionInfo.secondAdName, productionInfo.secondAdPhone].filter(Boolean).join(" · ")}
                </span>
              )}
              {productionInfo.crewCallPhone && <span>Crew call: {productionInfo.crewCallPhone}</span>}
            </div>
          )}

          {productionInfo.walkieChannels && (
            <div className="mt-4 whitespace-pre-wrap rounded-md bg-black/5 px-4 py-3 text-[11px] text-black/70">
              <span className="font-semibold">Walkie channels: </span>
              {productionInfo.walkieChannels}
            </div>
          )}

          <div className="mt-5">
            <div className="tracked text-[10px] uppercase text-black/50">
              Scenes ({formatPageCount(totalPagesRaw)} pages)
            </div>
            <div className="mt-2 divide-y divide-black/10">
              {day.scenes.map((s) => (
                <div key={s.number} className="flex items-center justify-between py-2 text-xs">
                  <span>
                    SC {s.number} — {s.slugline}
                  </span>
                  <span className="text-black/60">{formatPageCount(s.page_count)} pg</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="tracked text-[10px] uppercase text-black/50">Cast</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {day.cast_call_times.map((c) => (
                <span
                  key={c.name}
                  title={c.note}
                  className="rounded-full bg-black/8 px-3 py-1 text-xs font-medium"
                >
                  {c.name} · {c.hours_needed}h
                </span>
              ))}
            </div>
          </div>

          {day.validator_notes.length > 0 && (
            <div className="mt-5 space-y-1 border-t border-black/15 pt-3">
              {day.validator_notes.map((n, i) => (
                <p key={i} className="text-[11px] text-black/50">
                  {n}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {callSheets.unresolved.length > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-edge px-6 py-4 text-xs text-faint">
          {callSheets.unresolved.map((u, i) => (
            <p key={i}>{u}</p>
          ))}
        </div>
      )}
    </div>
  );
}
