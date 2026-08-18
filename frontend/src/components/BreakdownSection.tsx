import StageHeader from "./StageHeader";
import { Breakdown } from "@/lib/types";

export default function BreakdownSection({ breakdown }: { breakdown: Breakdown }) {
  return (
    <div>
      <StageHeader
        index={1}
        title="Script Breakdown Agent"
        description="Reads the uploaded PDF directly and extracts every scene into structured data — no manual re-typing."
        meta={`${breakdown.scene_count} scenes detected · ${breakdown.page_count} pages · est. runtime ${breakdown.estimated_runtime_minutes} min`}
        action={
          <span className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent">
            native PDF read
          </span>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-edge">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-edge bg-panel2 text-faint">
              <th className="px-4 py-3 font-medium">SC#</th>
              <th className="px-4 py-3 font-medium">I/E</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Cast</th>
              <th className="px-4 py-3 font-medium">Props / Special</th>
              <th className="px-4 py-3 text-right font-medium">Pgs</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.scenes.map((scene) => (
              <tr key={scene.number} className="border-b border-edge/60 bg-panel last:border-0">
                <td className="px-4 py-3 align-top text-accent">{scene.number}</td>
                <td className="px-4 py-3 align-top text-faint">{scene.int_ext}</td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-ink">{scene.location}</div>
                  <div className="tracked text-[10px] text-faint uppercase">
                    {scene.time_of_day}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {scene.characters.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-dim">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{scene.props.join(", ") || "—"}</span>
                    {scene.flags.map((f) => (
                      <span
                        key={f}
                        className="tracked rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] uppercase text-red-300"
                      >
                        {f.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right align-top text-dim">{scene.page_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
