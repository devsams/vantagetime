"use client";

import { DragEvent, useState } from "react";
import { formatPageCount } from "@/lib/callSheetExtras";
import { moveScene, stripColor, STRIP_COLOR_LABELS, STRIP_COLOR_STYLES, StripColor } from "@/lib/stripboard";
import { Breakdown, Schedule } from "@/lib/types";

interface DragPayload {
  sceneNumber: number;
  fromDay: number;
}

/** Drag-and-drop stripboard — the industry-standard view of a shoot
 * schedule as colored "strips" (one per scene, colored by INT/EXT +
 * DAY/NIGHT) that a coordinator can reorder within a day or move to a
 * different day, same as a physical strip board. Every drop recomputes
 * that day's total pages, locations, and cast hours immediately (see
 * lib/stripboard.ts) — a pure manual override of scene order/
 * assignment, no agent round trip. Embedded above the read-only
 * card/calendar view in the Dates tab's Scheduling sub-tab. */
export default function StripboardSection({
  breakdown,
  schedule,
  onUpdateSchedule,
}: {
  breakdown: Breakdown;
  schedule: Schedule;
  onUpdateSchedule: (schedule: Schedule) => void;
}) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: number; index: number } | null>(null);

  const sceneByNumber = new Map(breakdown.scenes.map((s) => [s.number, s]));

  function handleDragStart(e: DragEvent, sceneNumber: number, fromDay: number) {
    setDragging({ sceneNumber, fromDay });
    e.dataTransfer.effectAllowed = "move";
    // Real payload travels via React state (dataTransfer can't carry an
    // object cheaply cross-browser) — this call is just to satisfy
    // browsers that refuse a drag with no data set at all.
    e.dataTransfer.setData("text/plain", String(sceneNumber));
  }

  function handleDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  function handleStripDragOver(e: DragEvent, day: number, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ day, index });
  }

  function handleColumnDragOver(e: DragEvent, day: number, endIndex: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ day, index: endIndex });
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragging || !dropTarget) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const next = moveScene(
      schedule,
      breakdown,
      dragging.sceneNumber,
      dragging.fromDay,
      dropTarget.day,
      dropTarget.index
    );
    onUpdateSchedule(next);
    setDragging(null);
    setDropTarget(null);
  }

  const colorKeys = Object.keys(STRIP_COLOR_STYLES) as StripColor[];

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-faint">
          Drag a strip to reorder scenes within a day, or drop it on another day to move it —
          pages, locations, and cast hours recalculate automatically.
        </p>
        <div className="flex flex-wrap gap-3">
          {colorKeys.map((color) => (
            <div key={color} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm border ${STRIP_COLOR_STYLES[color]}`} />
              <span className="tracked text-[9px] text-faint uppercase">{STRIP_COLOR_LABELS[color]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {schedule.shoot_days.map((day) => (
          <div
            key={day.day_number}
            className="flex w-64 shrink-0 flex-col rounded-xl border border-edge bg-panel p-3"
            onDragOver={(e) => handleColumnDragOver(e, day.day_number, day.scenes.length)}
            onDrop={handleDrop}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="tracked text-[10px] text-faint uppercase">Day {day.day_number}</div>
              <div className="tracked text-[10px] text-faint">{formatPageCount(day.total_pages)} pg</div>
            </div>
            {day.date && <div className="mb-2 text-xs font-medium text-accent">{day.date}</div>}

            <div className="flex min-h-[2rem] flex-col gap-1.5">
              {day.scenes.length === 0 && (
                <div className="rounded-md border border-dashed border-edge px-2 py-4 text-center text-[10px] text-faint">
                  Drop a scene here
                </div>
              )}
              {day.scenes.map((sceneNumber, index) => {
                const scene = sceneByNumber.get(sceneNumber);
                if (!scene) return null;
                const color = stripColor(scene);
                const isDragging = dragging?.sceneNumber === sceneNumber;
                const showIndicatorBefore = dropTarget?.day === day.day_number && dropTarget.index === index;
                return (
                  <div key={sceneNumber}>
                    {showIndicatorBefore && <div className="h-0.5 rounded bg-accent" />}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, sceneNumber, day.day_number)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleStripDragOver(e, day.day_number, index)}
                      className={`cursor-grab rounded-md border px-2 py-1.5 text-[11px] shadow-sm transition active:cursor-grabbing ${STRIP_COLOR_STYLES[color]} ${isDragging ? "opacity-40" : ""}`}
                      title={scene.slugline}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">SC {scene.number}</span>
                        <span className="text-[9px] opacity-70">{formatPageCount(scene.page_count)} pg</span>
                      </div>
                      <div className="truncate text-[10px] opacity-80">{scene.slugline}</div>
                    </div>
                  </div>
                );
              })}
              {dropTarget?.day === day.day_number && dropTarget.index === day.scenes.length && day.scenes.length > 0 && (
                <div className="h-0.5 rounded bg-accent" />
              )}
            </div>

            {day.cast_hours.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1 border-t border-edge/60 pt-2">
                {day.cast_hours.map((c) => (
                  <span key={c.name} className="rounded-full bg-panel2 px-2 py-0.5 text-[9px] text-dim">
                    {c.name} · {c.hours_needed}h
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
