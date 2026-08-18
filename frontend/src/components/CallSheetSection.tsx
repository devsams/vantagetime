"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import {
  emptyCallSheetDayExtras,
  formatPageCount,
  newCallSheetCustomField,
} from "@/lib/callSheetExtras";
import {
  CallSheetCustomField,
  CallSheetDayExtras,
  CallSheets,
  LocationAvailability,
  ProductionInfo,
} from "@/lib/types";

type FixedDayExtraKey = Exclude<keyof CallSheetDayExtras, "customFields">;

const DAY_EXTRA_FIELDS: {
  key: FixedDayExtraKey;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "advanceSchedule",
    label: "Advance Call / Next-Day Schedule",
    placeholder: "Tomorrow's preview: scenes, sets, and cast needed — for overnight prep.",
  },
  {
    key: "specialEquipment",
    label: "Special Equipment & Department Notes",
    placeholder: "e.g. Steadicam required. SFX explosion scene 4. Rain machine on set.",
  },
  {
    key: "parkingShuttle",
    label: "Parking & Shuttles",
    placeholder: "On/off-site parking instructions and shuttle run times.",
  },
  {
    key: "companyMove",
    label: "Company Move Schedule",
    placeholder: "Timeline and directions if moving between locations mid-day.",
  },
  {
    key: "backgroundExtras",
    label: "Background / Extras",
    placeholder: "Headcount, arrival time, holding area, wardrobe requirements.",
  },
  {
    key: "castTransport",
    label: "Cast Pick-Up & Transport",
    placeholder: "Driver schedule — who's picked up, from where, at what time.",
  },
  {
    key: "standInsStunts",
    label: "Stand-Ins & Stunt Doubles",
    placeholder: "Arrival times, wardrobe, and assignment notes.",
  },
  {
    key: "minorRules",
    label: "Minor / Child Actor Rules",
    placeholder: "Child-labor compliance, tutor hours, legal max working hours.",
  },
];

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
  callSheetExtras,
  onUpdateProductionInfo,
  onUpdateCallSheetExtras,
}: {
  callSheets: CallSheets;
  projectName: string;
  locationAvailability: Record<string, LocationAvailability>;
  productionInfo: ProductionInfo;
  callSheetExtras: Record<number, CallSheetDayExtras>;
  onUpdateProductionInfo: (info: ProductionInfo) => void;
  onUpdateCallSheetExtras: (extras: Record<number, CallSheetDayExtras>) => void;
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
  const extras = day ? callSheetExtras[day.day_number] ?? emptyCallSheetDayExtras() : emptyCallSheetDayExtras();

  function patchProductionInfo(patch: Partial<ProductionInfo>) {
    onUpdateProductionInfo({ ...productionInfo, ...patch });
  }

  function patchDayExtras(dayNumber: number, patch: Partial<CallSheetDayExtras>) {
    const current = callSheetExtras[dayNumber] ?? emptyCallSheetDayExtras();
    onUpdateCallSheetExtras({ ...callSheetExtras, [dayNumber]: { ...current, ...patch } });
  }

  function addCustomField(dayNumber: number) {
    const current = callSheetExtras[dayNumber] ?? emptyCallSheetDayExtras();
    patchDayExtras(dayNumber, { customFields: [...current.customFields, newCallSheetCustomField()] });
  }

  function patchCustomField(dayNumber: number, fieldId: string, patch: Partial<CallSheetCustomField>) {
    const current = callSheetExtras[dayNumber] ?? emptyCallSheetDayExtras();
    patchDayExtras(dayNumber, {
      customFields: current.customFields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
    });
  }

  function removeCustomField(dayNumber: number, fieldId: string) {
    const current = callSheetExtras[dayNumber] ?? emptyCallSheetDayExtras();
    patchDayExtras(dayNumber, {
      customFields: current.customFields.filter((f) => f.id !== fieldId),
    });
  }

  return (
    <div>
      <StageHeader
        index={5}
        title="Call Sheet Generator"
        description="Structured formatting from the validated schedule, plus a note only on the days that actually need one."
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
        <div className="rounded-2xl bg-[#f4f2ea] p-8 text-[#1a1a16]">
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
              {locationContact && <div className="mt-0.5 text-black/50">Contact: {locationContact}</div>}
            </div>
          </div>

          {day.safety_notes && (
            <div className="mt-4 rounded-md bg-[#c9f542]/40 px-4 py-3 text-xs text-black/80">
              ⚠ {day.safety_notes}
            </div>
          )}
          {!day.safety_notes && day.call_time_note && (
            <div className="mt-4 rounded-md bg-[#c9f542]/40 px-4 py-3 text-xs text-black/80">
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

          {(day.location.nearest_hospital ||
            day.location.emergency_contacts ||
            productionInfo.safetyOfficerName ||
            productionInfo.safetyHotline ||
            productionInfo.medicName) && (
            <div className="mt-4 rounded-md border border-red-900/20 bg-red-900/5 px-4 py-3 text-xs text-black/80">
              <div className="tracked mb-1 text-[10px] uppercase text-red-900/60">
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

          <div className="mt-6 border-t border-black/15 pt-4">
            <div className="tracked mb-2 text-[10px] uppercase text-black/50">
              Additional day notes — filmmaker-entered
            </div>
            <div className="space-y-2">
              {DAY_EXTRA_FIELDS.map((f) => (
                <div
                  key={f.key}
                  className="grid grid-cols-1 gap-2 border-b border-black/10 pb-2 sm:grid-cols-[200px_1fr] sm:items-start"
                >
                  <div className="pt-1.5 text-xs font-medium text-black/70">{f.label}</div>
                  <textarea
                    value={extras[f.key]}
                    onChange={(e) => patchDayExtras(day.day_number, { [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={2}
                    className="rounded-md border border-black/15 bg-white/60 px-2 py-1 text-[11px] text-black/80 placeholder:text-black/30 focus:border-black/40 focus:outline-none"
                  />
                </div>
              ))}

              {extras.customFields.map((field) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2 border-b border-black/10 pb-2 sm:grid-cols-[200px_1fr] sm:items-start"
                >
                  <div className="flex items-start gap-1">
                    <input
                      type="text"
                      value={field.question}
                      onChange={(e) =>
                        patchCustomField(day.day_number, field.id, { question: e.target.value })
                      }
                      placeholder="Question / label"
                      className="w-full rounded-md border border-black/15 bg-white/60 px-2 py-1.5 text-xs font-medium text-black/70 placeholder:text-black/30 focus:border-black/40 focus:outline-none"
                    />
                    <button
                      onClick={() => removeCustomField(day.day_number, field.id)}
                      title="Remove field"
                      className="mt-0.5 shrink-0 px-1 text-sm text-black/30 hover:text-black/60"
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    value={field.answer}
                    onChange={(e) =>
                      patchCustomField(day.day_number, field.id, { answer: e.target.value })
                    }
                    placeholder="Answer / notes"
                    rows={2}
                    className="rounded-md border border-black/15 bg-white/60 px-2 py-1 text-[11px] text-black/80 placeholder:text-black/30 focus:border-black/40 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => addCustomField(day.day_number)}
              className="tracked mt-3 rounded-full border border-black/20 px-3 py-1 text-[10px] uppercase text-black/60 transition hover:border-black/40 hover:text-black/80"
            >
              + Add field
            </button>
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
