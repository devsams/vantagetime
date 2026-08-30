import { useRef } from "react";
import StageHeader from "./StageHeader";
import { Breakdown, Project } from "@/lib/types";

export default function BreakdownSection({
  breakdown,
  sourceDocument,
  onViewSourceDocument,
  onDownloadSourceDocument,
  onReuploadScript,
  loading,
}: {
  breakdown: Breakdown;
  sourceDocument?: Project["sourceDocument"];
  onViewSourceDocument?: () => void;
  onDownloadSourceDocument?: () => void;
  onReuploadScript?: (file: File) => void;
  loading?: boolean;
}) {
  const reuploadRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <StageHeader
        index={2}
        title="Script Breakdown Agent"
        description="Reads the uploaded PDF directly and extracts every scene into structured data — no manual re-typing."
        meta={`${breakdown.scene_count} scenes detected · ${breakdown.page_count} pages · est. runtime ${breakdown.estimated_runtime_minutes} min`}
        action={
          <div className="flex items-center gap-2">
            <span className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent">
              native PDF read
            </span>
            {sourceDocument && (
              <>
                <button
                  onClick={onViewSourceDocument}
                  title={sourceDocument.name}
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-dim uppercase transition hover:text-ink"
                >
                  View original
                </button>
                <button
                  onClick={onDownloadSourceDocument}
                  title={sourceDocument.name}
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-dim uppercase transition hover:text-ink"
                >
                  Download
                </button>
              </>
            )}
            {onReuploadScript && (
              <>
                <input
                  ref={reuploadRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onReuploadScript(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => reuploadRef.current?.click()}
                  disabled={loading}
                  title="Upload a revised or expanded draft — re-runs the breakdown, schedule, call sheets, and outreach against it. Scenes may regroup into different shoot days."
                  className="tracked rounded-full border border-edge px-3 py-1.5 text-xs text-dim uppercase transition hover:text-ink disabled:opacity-50"
                >
                  {loading ? "Working..." : "Upload revised script"}
                </button>
              </>
            )}
          </div>
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
                        className="tracked rounded-full bg-coral/15 px-2 py-0.5 text-[9px] uppercase text-coral"
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
