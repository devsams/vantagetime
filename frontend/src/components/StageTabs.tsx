import { STAGE_LABELS, STAGE_ORDER, StageKey } from "@/lib/types";

export default function StageTabs({
  active,
  doneMap,
  onSelect,
}: {
  active: StageKey;
  doneMap: Record<StageKey, boolean>;
  onSelect: (key: StageKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {STAGE_ORDER.map((key, i) => {
        const isActive = key === active;
        const isDone = doneMap[key];
        const num = String(i + 1).padStart(2, "0");

        const classes = isActive
          ? "bg-accent text-accent-ink border-accent"
          : isDone
          ? "border-accent/50 text-accent bg-transparent hover:bg-accent/10"
          : "border-edge text-faint bg-transparent hover:border-dim hover:text-dim";

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${classes}`}
          >
            <span className="font-mono text-xs opacity-70">
              {isDone && !isActive ? "✓" : num}
            </span>
            {STAGE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
