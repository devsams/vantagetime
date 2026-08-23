import { STAGE_LABELS, STAGE_ORDER, StageKey } from "@/lib/types";

// A little of MotherDuck's own trick: their architecture diagrams tag
// each block (PULSE, MEGA, JUMBO...) with a different pastel color
// rather than repeating one accent everywhere. Cycling the seven stages
// through four brand hues does the same for the pipeline tabs.
// Classes are written out in full (not built with template strings) so
// Tailwind's static scanner can actually find and generate them.
// Active tabs get a gradient fill + a color-matched glow (instead of a
// flat fill) — poster-style punch on the one control that always shows
// exactly where you are in the pipeline.
const HUE_CLASSES = {
  accent: {
    active:
      "bg-gradient-to-br from-accent to-coral text-accent-ink border-accent shadow-[0_8px_20px_-8px_rgba(217,100,10,0.6)]",
    done: "border-accent/50 text-accent bg-transparent hover:bg-accent/10",
  },
  blue: {
    active:
      "bg-gradient-to-br from-blue to-mint text-accent-ink border-blue shadow-[0_8px_20px_-8px_rgba(28,127,184,0.55)]",
    done: "border-blue/50 text-blue bg-transparent hover:bg-blue/10",
  },
  mint: {
    active:
      "bg-gradient-to-br from-mint to-blue text-accent-ink border-mint shadow-[0_8px_20px_-8px_rgba(14,143,114,0.55)]",
    done: "border-mint/50 text-mint bg-transparent hover:bg-mint/10",
  },
  coral: {
    active:
      "bg-gradient-to-br from-coral to-accent text-accent-ink border-coral shadow-[0_8px_20px_-8px_rgba(217,72,58,0.55)]",
    done: "border-coral/50 text-coral bg-transparent hover:bg-coral/10",
  },
} as const;
const STAGE_HUES = Object.keys(HUE_CLASSES) as (keyof typeof HUE_CLASSES)[];
type StageHue = (typeof STAGE_HUES)[number];

function hueClasses(hue: StageHue, isActive: boolean, isDone: boolean): string {
  if (isActive) return HUE_CLASSES[hue].active;
  if (isDone) return HUE_CLASSES[hue].done;
  return "border-edge text-faint bg-transparent hover:border-dim hover:text-dim";
}

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
        const hue = STAGE_HUES[i % STAGE_HUES.length];

        const classes = hueClasses(hue, isActive, isDone);

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
