"use client";

import { useEffect, useRef, useState } from "react";
import AvailabilitySection from "@/components/AvailabilitySection";
import BreakdownSection from "@/components/BreakdownSection";
import CallSheetSection from "@/components/CallSheetSection";
import DatesSection from "@/components/DatesSection";
import LocationsSection from "@/components/LocationsSection";
import PlanningSection from "@/components/PlanningSection";
import ScheduleSection from "@/components/ScheduleSection";
import StagePill from "@/components/StagePill";
import StageTabs from "@/components/StageTabs";
import StatusSection from "@/components/StatusSection";
import ValidatorSection from "@/components/ValidatorSection";
import { fileToBase64, runPipeline } from "@/lib/api";
import { emptyProductionInfo } from "@/lib/callSheetExtras";
import { loadProjects, saveProjects } from "@/lib/storage";
import { Project, STAGE_LABELS, STAGE_ORDER, StageKey } from "@/lib/types";

function newProject(name: string): Project {
  return {
    id: crypto.randomUUID(),
    name,
    sessionId: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: null,
    breakdown: null,
    schedule: null,
    locationResearch: {},
    callSheets: null,
    castOutreach: null,
    availabilityLinks: {},
    castEmails: {},
    castPriority: {},
    crew: [],
    proposedPeriod: null,
    locationAvailability: {},
    otherItems: [],
    productionInfo: emptyProductionInfo(),
    callSheetExtras: {},
    feed: [],
  };
}

function stageDone(project: Project, key: StageKey): boolean {
  switch (key) {
    case "breakdown":
      return !!project.breakdown;
    case "scheduling":
      return !!project.schedule;
    case "validator":
      return !!project.schedule;
    case "locations":
      return Object.values(project.locationResearch).some((r) => r.assigned);
    case "callSheet":
      return !!project.callSheets && project.callSheets.call_sheets.length > 0;
    case "availability":
      return !!project.castOutreach && project.castOutreach.cast_outreach.length > 0;
    case "planning":
      return Object.keys(project.availabilityLinks ?? {}).length > 0;
    case "dates":
      return project.schedule?.shoot_days.some((d) => d.date) ?? false;
    default:
      return false;
  }
}

function doneMap(project: Project): Record<StageKey, boolean> {
  return {
    breakdown: stageDone(project, "breakdown"),
    scheduling: stageDone(project, "scheduling"),
    validator: stageDone(project, "validator"),
    locations: stageDone(project, "locations"),
    callSheet: stageDone(project, "callSheet"),
    availability: stageDone(project, "availability"),
    planning: stageDone(project, "planning"),
    dates: stageDone(project, "dates"),
    status: stageDone(project, "status"),
  };
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const stats = project.breakdown
    ? [
        { value: project.breakdown.scene_count, label: "Scenes" },
        { value: project.schedule?.shoot_days.length ?? 0, label: "Shoot Days" },
        { value: project.breakdown.locations.length, label: "Locations" },
        { value: project.breakdown.cast.length, label: "Cast" },
      ]
    : [];

  return (
    <div className="rounded-2xl border border-edge bg-panel p-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="tracked text-xs font-medium text-accent uppercase">
            {project.breakdown?.format ?? "Processing"}
          </div>
          <h2
            className="mt-1 text-5xl leading-none uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {project.breakdown?.project_name || project.name}
          </h2>
          {project.breakdown?.logline && (
            <p className="mt-3 max-w-xl text-sm text-dim">{project.breakdown.logline}</p>
          )}
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-95"
        >
          Open Project →
        </button>
      </div>

      {stats.length > 0 && (
        <div className="mt-8 flex gap-10">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-semibold text-ink">{s.value}</div>
              <div className="tracked mt-1 text-[11px] text-faint uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {STAGE_ORDER.map((key) => (
          <StagePill key={key} label={STAGE_LABELS[key]} done={stageDone(project, key)} />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StageKey>("breakdown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjects(loadProjects());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveProjects(projects);
  }, [projects, hydrated]);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  function updateProject(id: string, patch: Partial<Project>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function submitToPipeline(project: Project, parts: Parameters<typeof runPipeline>[1]) {
    setLoading(true);
    setError(null);
    const result = await runPipeline(project.sessionId, parts);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }

    updateProject(project.id, {
      breakdown: result.breakdown ?? project.breakdown,
      schedule: result.schedule ?? project.schedule,
      locationResearch: { ...project.locationResearch, ...result.locationResearch },
      callSheets: result.callSheets ?? project.callSheets,
      castOutreach: result.castOutreach ?? project.castOutreach,
      feed: result.feed,
      updatedAt: Date.now(),
    });
  }

  async function handleFileUpload(file: File) {
    if (loading) return;
    const project = newProject(file.name.replace(/\.pdf$/i, ""));
    setProjects((prev) => [...prev, project]);
    setActiveId(project.id);
    setActiveStage("breakdown");

    const data = await fileToBase64(file);
    await submitToPipeline(project, [
      { text: "Break this script down and build a validated shoot schedule." },
      { inlineData: { displayName: file.name, data, mimeType: "application/pdf" } },
    ]);
  }

  async function handleFollowUp() {
    if (!activeProject || !message.trim() || loading) return;
    const text = message.trim();
    setMessage("");
    await submitToPipeline(activeProject, [{ text }]);
  }

  async function handleSetShootWindow(start: string, end: string) {
    if (!activeProject || loading) return;
    await submitToPipeline(activeProject, [
      {
        text: `SHOOT_WINDOW: start=${start} end=${end} — please assign real calendar dates to the validated schedule within this window.`,
      },
    ]);
  }

  if (activeProject) {
    const projectTitle = activeProject.breakdown?.project_name || activeProject.name;
    const done = doneMap(activeProject);

    return (
      <div className="flex min-h-full flex-col bg-bg">
        <header className="flex items-center justify-between border-b border-edge px-8 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveId(null)}
              className="tracked rounded-full border border-edge px-4 py-2 text-xs text-dim uppercase transition hover:text-ink"
            >
              ← Dashboard
            </button>
            <span className="tracked text-sm font-medium uppercase text-ink">{projectTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
            <span className="tracked text-sm font-semibold uppercase">VantageTime</span>
          </div>
        </header>

        <div className="border-b border-edge px-8 py-5">
          <StageTabs active={activeStage} doneMap={done} onSelect={setActiveStage} />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-10">
          {loading && (
            <p className="tracked mb-6 text-xs text-accent uppercase">
              Running the pipeline — breakdown → schedule → location research → call sheet →
              availability. This can take a minute...
            </p>
          )}
          {error && (
            <p className="mb-6 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          {activeStage === "breakdown" &&
            (activeProject.breakdown ? (
              <BreakdownSection breakdown={activeProject.breakdown} />
            ) : (
              <p className="text-sm text-faint">No breakdown yet.</p>
            ))}

          {activeStage === "scheduling" &&
            (activeProject.schedule ? (
              <ScheduleSection schedule={activeProject.schedule} />
            ) : (
              <p className="text-sm text-faint">No schedule yet.</p>
            ))}

          {activeStage === "validator" &&
            (activeProject.schedule ? (
              <ValidatorSection schedule={activeProject.schedule} />
            ) : (
              <p className="text-sm text-faint">No schedule to validate yet.</p>
            ))}

          {activeStage === "locations" && (
            <LocationsSection
              locationResearch={activeProject.locationResearch}
              breakdown={activeProject.breakdown}
              updatedAt={activeProject.updatedAt}
            />
          )}

          {activeStage === "callSheet" &&
            (activeProject.callSheets && activeProject.callSheets.call_sheets.length > 0 ? (
              <CallSheetSection
                callSheets={activeProject.callSheets}
                projectName={projectTitle}
                locationAvailability={activeProject.locationAvailability ?? {}}
                productionInfo={activeProject.productionInfo ?? emptyProductionInfo()}
                callSheetExtras={activeProject.callSheetExtras ?? {}}
                onUpdateProductionInfo={(productionInfo) =>
                  updateProject(activeProject.id, { productionInfo })
                }
                onUpdateCallSheetExtras={(callSheetExtras) =>
                  updateProject(activeProject.id, { callSheetExtras })
                }
              />
            ) : (
              <p className="text-sm text-faint">No call sheet yet.</p>
            ))}

          {activeStage === "availability" &&
            (activeProject.castOutreach && activeProject.castOutreach.cast_outreach.length > 0 ? (
              <AvailabilitySection
                castOutreach={activeProject.castOutreach}
                sessionId={activeProject.sessionId}
                projectName={projectTitle}
                availabilityLinks={activeProject.availabilityLinks ?? {}}
                proposedPeriod={activeProject.proposedPeriod ?? null}
                onLinksGenerated={(links) =>
                  updateProject(activeProject.id, {
                    availabilityLinks: { ...(activeProject.availabilityLinks ?? {}), ...links },
                  })
                }
                onRequestReschedule={(text) => setMessage(text)}
              />
            ) : (
              <p className="text-sm text-faint">No cast outreach yet.</p>
            ))}

          {activeStage === "planning" &&
            (activeProject.breakdown && activeProject.schedule ? (
              <PlanningSection
                projectName={projectTitle}
                sessionId={activeProject.sessionId}
                breakdown={activeProject.breakdown}
                schedule={activeProject.schedule}
                castEmails={activeProject.castEmails ?? {}}
                castPriority={activeProject.castPriority ?? {}}
                crew={activeProject.crew ?? []}
                availabilityLinks={activeProject.availabilityLinks ?? {}}
                proposedPeriod={activeProject.proposedPeriod ?? null}
                locationAvailability={activeProject.locationAvailability ?? {}}
                otherItems={activeProject.otherItems ?? []}
                onUpdateCastEmails={(castEmails) => updateProject(activeProject.id, { castEmails })}
                onUpdateCastPriority={(castPriority) => updateProject(activeProject.id, { castPriority })}
                onUpdateCrew={(crew) => updateProject(activeProject.id, { crew })}
                onUpdateProposedPeriod={(proposedPeriod) =>
                  updateProject(activeProject.id, { proposedPeriod })
                }
                onUpdateLocationAvailability={(locationAvailability) =>
                  updateProject(activeProject.id, { locationAvailability })
                }
                onUpdateOtherItems={(otherItems) => updateProject(activeProject.id, { otherItems })}
                onRequestReschedule={(text) => setMessage(text)}
                onLinksGenerated={(links) =>
                  updateProject(activeProject.id, {
                    availabilityLinks: { ...(activeProject.availabilityLinks ?? {}), ...links },
                  })
                }
              />
            ) : (
              <p className="text-sm text-faint">No validated schedule yet.</p>
            ))}

          {activeStage === "dates" &&
            (activeProject.breakdown && activeProject.schedule ? (
              <DatesSection
                projectName={projectTitle}
                sessionId={activeProject.sessionId}
                breakdown={activeProject.breakdown}
                schedule={activeProject.schedule}
                castEmails={activeProject.castEmails ?? {}}
                crew={activeProject.crew ?? []}
                onSetShootWindow={handleSetShootWindow}
              />
            ) : (
              <p className="text-sm text-faint">No validated schedule yet.</p>
            ))}

          {activeStage === "status" &&
            (activeProject.breakdown && activeProject.schedule ? (
              <StatusSection
                breakdown={activeProject.breakdown}
                schedule={activeProject.schedule}
                crew={activeProject.crew ?? []}
                castEmails={activeProject.castEmails ?? {}}
                castPriority={activeProject.castPriority ?? {}}
                availabilityLinks={activeProject.availabilityLinks ?? {}}
                sessionId={activeProject.sessionId}
              />
            ) : (
              <p className="text-sm text-faint">No validated schedule yet.</p>
            ))}

          <div className="mt-10 flex items-center gap-2 border-t border-edge pt-5">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFollowUp()}
              placeholder={`e.g. "We're shooting this in Austin, TX"`}
              className="flex-1 rounded-full border border-edge bg-panel2 px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleFollowUp}
              disabled={loading || !message.trim()}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-95 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-edge px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
          <span className="tracked text-sm font-semibold uppercase">VantageTime</span>
        </div>
        <nav className="tracked flex items-center gap-8 text-xs text-dim uppercase">
          <span>Productions</span>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-12">
        <div className="tracked mb-4 text-xs text-dim uppercase">Your Projects</div>

        {error && (
          <p className="mb-4 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-6">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => {
                setActiveId(p.id);
                setActiveStage("breakdown");
              }}
            />
          ))}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="rounded-2xl border border-dashed border-edge px-8 py-10 text-center text-sm text-faint transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {loading ? "Uploading..." : "+ New Project — upload a script PDF"}
          </button>
        </div>
      </main>
    </div>
  );
}
