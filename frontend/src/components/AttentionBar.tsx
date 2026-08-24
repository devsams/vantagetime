"use client";

import { AttentionItem } from "@/lib/attention";

/** A persistent, click-through summary of everything the project is
 * currently waiting on — the same signals Autopilot's step cards check,
 * surfaced on every tab so the filmmaker doesn't have to remember to go
 * check Autopilot themselves. Clicking it always lands on Autopilot,
 * which already has the interactive fix for each item; this bar is
 * intentionally just a pointer to that, not a second place to manage
 * the same state. Renders nothing once nothing needs attention. */
export default function AttentionBar({
  items,
  onOpenAutopilot,
}: {
  items: AttentionItem[];
  onOpenAutopilot: () => void;
}) {
  if (items.length === 0) return null;

  const summary =
    items.length === 1 ? items[0].label : `${items.length} things need attention`;
  const detail = items.map((i) => i.label).join(" · ");

  return (
    <button
      onClick={onOpenAutopilot}
      title={detail}
      className="tracked flex w-full items-center gap-3 border-b border-amber/40 bg-amber/10 px-8 py-2.5 text-left text-xs text-amber transition hover:bg-amber/15"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber/50 bg-amber/15 text-[10px] font-semibold">
        !
      </span>
      <span className="truncate font-medium uppercase">{summary}</span>
      <span className="hidden truncate text-amber/70 normal-case sm:inline">{detail}</span>
      <span className="ml-auto shrink-0 uppercase text-amber/80">Open Autopilot →</span>
    </button>
  );
}
