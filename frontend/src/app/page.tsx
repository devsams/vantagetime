"use client";

import { useEffect, useRef, useState } from "react";
import AvailabilitySection from "@/components/AvailabilitySection";
import BreakdownSection from "@/components/BreakdownSection";
import CallSheetSection from "@/components/CallSheetSection";
import ChatPanel from "@/components/ChatPanel";
import DatesSection from "@/components/DatesSection";
import { ScriptIcon, SpreadsheetIcon } from "@/components/EntryIcons";
import ScheduleSection from "@/components/ScheduleSection";
import StagePill from "@/components/StagePill";
import StageTabs from "@/components/StageTabs";
import StatusSection from "@/components/StatusSection";
import ValidatorSection from "@/components/ValidatorSection";
import { extractRosterFromDocument, fileToBase64, importRoster, runPipeline } from "@/lib/api";
import { emptyProductionInfo } from "@/lib/callSheetExtras";
import { dataUrlToObjectUrl, shouldStoreDocument, toDataUrl } from "@/lib/files";
import { applyRosterImport } from "@/lib/rosterProject";
import { downloadRosterTemplate } from "@/lib/rosterTemplate";
import { loadProjects, saveProjects } from "@/lib/storage";
import { humanizeFileName } from "@/lib/text";
import { ChatAction, Project, STAGE_LABELS, STAGE_ORDER, StageKey } from "@/lib/types";

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
    castAvailabilityNote: {},
    crew: [],
    proposedPeriod: null,
    locationAvailability: {},
    otherItems: [],
    productionInfo: emptyProductionInfo(),
    callSheetExtras: {},
    feed: [],
    sourceDocument: null,
    chatThreads: [],
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
    case "callSheet":
      return !!project.callSheets && project.callSheets.call_sheets.length > 0;
    case "dates":
      // "Dates" now covers location research + roster/outreach + the
      // real per-day calendar — done once real dates are actually
      // assigned, the end of that whole flow.
      return project.schedule?.shoot_days.some((d) => d.date) ?? false;
    case "availability":
      // The dashboard itself has no "done" state — treat it as done once
      // outreach has actually gone out to at least one person.
      return Object.keys(project.availabilityLinks ?? {}).length > 0;
    default:
      return false;
  }
}

function doneMap(project: Project): Record<StageKey, boolean> {
  return {
    breakdown: stageDone(project, "breakdown"),
    scheduling: stageDone(project, "scheduling"),
    validator: stageDone(project, "validator"),
    callSheet: stageDone(project, "callSheet"),
    dates: stageDone(project, "dates"),
    status: stageDone(project, "status"),
    availability: stageDone(project, "availability"),
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
    <div className="rounded-2xl border border-edge bg-panel p-8 shadow-[0_20px_50px_-30px_rgba(23,19,13,0.35)]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="tracked text-xs font-medium text-accent uppercase">
            {project.startedFrom === "roster" ? "From spreadsheet" : project.breakdown?.format ?? "Processing"}
          </div>
          <h2
            className="title-gradient mt-1 text-5xl leading-none uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {project.breakdown?.project_name || humanizeFileName(project.name)}
          </h2>
          {project.breakdown?.logline && (
            <p className="mt-3 max-w-xl text-sm text-dim">{project.breakdown.logline}</p>
          )}
        </div>
        <button
          onClick={onOpen}
          className="btn-poster shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold"
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
  const rosterInputRef = useRef<HTMLInputElement>(null);

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

  function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
    return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
  }

  function renameKey<T>(map: Record<string, T>, oldKey: string, newKey: string): Record<string, T> {
    if (!(oldKey in map)) return map;
    return { ...omitKey(map, oldKey), [newKey]: map[oldKey] };
  }

  // Cast members are the one roster entity with no stable id — the
  // name IS the key, reused across castEmails/castPriority/
  // castAvailabilityNote/availabilityLinks and referenced by scene
  // characters — so renaming or removing one has to touch every place
  // that name shows up, not just breakdown.cast, or a rename would
  // silently orphan that person's email/priority/outreach link. This
  // matters more now than it used to: an imported roster's names come
  // from a CSV parse or an LLM reading a messy document, either of
  // which can get a name wrong, and mid-production a cast change is
  // routine (an actor drops out, a name was misspelled at intake).
  function renameCastMember(oldName: string, newName: string) {
    if (!activeProject?.breakdown) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const breakdown = activeProject.breakdown;
    updateProject(activeProject.id, {
      breakdown: {
        ...breakdown,
        cast: breakdown.cast.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c)),
        scenes: breakdown.scenes.map((s) => ({
          ...s,
          characters: s.characters.map((c) => (c === oldName ? trimmed : c)),
        })),
      },
      castEmails: renameKey(activeProject.castEmails ?? {}, oldName, trimmed),
      castPriority: renameKey(activeProject.castPriority ?? {}, oldName, trimmed),
      castAvailabilityNote: renameKey(activeProject.castAvailabilityNote ?? {}, oldName, trimmed),
      // Deliberately NOT migrated: an availability link's backend token
      // is registered under the old name, and any response already
      // recorded against it is keyed by that same old name — carrying
      // the token forward under a new label would make the dashboard
      // silently misattribute (or lose track of) whatever that person
      // already answered. A renamed/replaced cast member starts back
      // at "no link yet" and gets a fresh one, which is the only way
      // their responses track correctly under the new name.
      availabilityLinks: omitKey(activeProject.availabilityLinks ?? {}, oldName),
    });
  }

  function updateCastRole(name: string, role_size: string) {
    if (!activeProject?.breakdown) return;
    updateProject(activeProject.id, {
      breakdown: {
        ...activeProject.breakdown,
        cast: activeProject.breakdown.cast.map((c) => (c.name === name ? { ...c, role_size } : c)),
      },
    });
  }

  function addCastMember(name: string, role_size: string) {
    if (!activeProject?.breakdown) return;
    const trimmed = name.trim();
    if (!trimmed || activeProject.breakdown.cast.some((c) => c.name === trimmed)) return;
    updateProject(activeProject.id, {
      breakdown: {
        ...activeProject.breakdown,
        cast: [
          ...activeProject.breakdown.cast,
          { name: trimmed, scene_count: 0, role_size: role_size.trim() || "Cast" },
        ],
      },
    });
  }

  function removeCastMember(name: string) {
    if (!activeProject?.breakdown) return;
    updateProject(activeProject.id, {
      breakdown: {
        ...activeProject.breakdown,
        cast: activeProject.breakdown.cast.filter((c) => c.name !== name),
      },
      castEmails: omitKey(activeProject.castEmails ?? {}, name),
      castPriority: omitKey(activeProject.castPriority ?? {}, name),
      castAvailabilityNote: omitKey(activeProject.castAvailabilityNote ?? {}, name),
    });
  }

  // Crew has a stable id (unlike cast), so these key off name only for
  // the chat's convenience — it only ever sees names, never ids — and
  // look up the real id internally. Mirrors the cast handlers above,
  // and the same PlanningSection UI these also back (onUpdateCrew).
  function addCrewMember(name: string, role: string, email: string) {
    if (!activeProject) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    updateProject(activeProject.id, {
      crew: [
        ...(activeProject.crew ?? []),
        { id: crypto.randomUUID(), name: trimmed, role: role.trim(), email: email.trim(), priority: false },
      ],
    });
  }

  function updateCrewMember(
    name: string,
    patch: { new_name?: string; role?: string; email?: string }
  ) {
    if (!activeProject) return;
    const crew = activeProject.crew ?? [];
    const idx = crew.findIndex((c) => c.name === name);
    if (idx === -1) return;
    const next = { ...crew[idx] };
    if (patch.new_name?.trim()) next.name = patch.new_name.trim();
    if (patch.role !== undefined) next.role = patch.role;
    if (patch.email !== undefined) next.email = patch.email;
    updateProject(activeProject.id, { crew: crew.map((c, i) => (i === idx ? next : c)) });
  }

  function removeCrewMember(name: string) {
    if (!activeProject) return;
    updateProject(activeProject.id, {
      crew: (activeProject.crew ?? []).filter((c) => c.name !== name),
    });
  }

  /** Dispatches a chat-issued tool call to the exact same update
   * functions the UI's own edit controls use — see chat_routes.py for
   * the matching tool declarations. Unrecognized/malformed actions are
   * silently dropped rather than throwing, since a stray or malformed
   * call from the model shouldn't break the chat turn. */
  function applyChatAction(action: ChatAction) {
    const s = (v: unknown): string => (typeof v === "string" ? v : "");
    const sOrUndef = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    switch (action.name) {
      case "rename_cast_member":
        renameCastMember(s(action.args.old_name), s(action.args.new_name));
        break;
      case "update_cast_role":
        updateCastRole(s(action.args.name), s(action.args.role_size));
        break;
      case "add_cast_member":
        addCastMember(s(action.args.name), s(action.args.role_size));
        break;
      case "remove_cast_member":
        removeCastMember(s(action.args.name));
        break;
      case "add_crew_member":
        addCrewMember(s(action.args.name), s(action.args.role), s(action.args.email));
        break;
      case "update_crew_member":
        updateCrewMember(s(action.args.name), {
          new_name: sOrUndef(action.args.new_name),
          role: sOrUndef(action.args.role),
          email: sOrUndef(action.args.email),
        });
        break;
      case "remove_crew_member":
        removeCrewMember(s(action.args.name));
        break;
      case "set_shoot_window":
        void handleSetShootWindow(s(action.args.start), s(action.args.end));
        break;
      default:
        break;
    }
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
    const data = await fileToBase64(file);
    const project = newProject(humanizeFileName(file.name.replace(/\.pdf$/i, "")));
    if (shouldStoreDocument(file)) {
      project.sourceDocument = {
        name: file.name,
        mimeType: file.type || "application/pdf",
        dataUrl: toDataUrl(file.type || "application/pdf", data),
      };
    }
    setProjects((prev) => [...prev, project]);
    setActiveId(project.id);
    setActiveStage("breakdown");

    await submitToPipeline(project, [
      { text: "Break this script down and build a validated shoot schedule." },
      { inlineData: { displayName: file.name, data, mimeType: "application/pdf" } },
    ]);
  }

  /** The alternate entry point: no script, just existing production
   * data. A well-formed .csv (matching VantageTime's documented
   * template) gets fast, free, deterministic parsing (roster_import.py).
   * A PDF/Word doc, OR a .csv that doesn't match the template (real
   * production sheets rarely do — merged columns, category-tagged
   * rows, whatever export format someone already had), falls back to
   * the roster_extractor agent, which reads the raw file with an LLM
   * and returns the exact same RosterImportResult shape. Either way,
   * everything after this point — applyRosterImport, the rest of the
   * app — never needs to know which path a given roster came from.
   * Scenes/schedule/call sheets just start empty either way, since
   * neither source has scene-level information to give them. */
  async function handleRosterUpload(file: File) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const base = newProject(humanizeFileName(file.name.replace(/\.(csv|pdf)$/i, "")));
      if (shouldStoreDocument(file)) {
        const mimeType = file.type || (isCsv ? "text/csv" : "application/pdf");
        base.sourceDocument = {
          name: file.name,
          mimeType,
          dataUrl: toDataUrl(mimeType, await fileToBase64(file)),
        };
      }

      let result;
      let usedFallback = false;
      if (isCsv) {
        try {
          result = await importRoster(await file.text());
        } catch {
          // Doesn't match the strict template — hand the same file to
          // the extraction agent instead of just failing on the user.
          usedFallback = true;
          result = await extractRosterFromDocument(base.sessionId, file);
        }
      } else {
        result = await extractRosterFromDocument(base.sessionId, file);
      }

      const project = applyRosterImport(base, result);
      setProjects((prev) => [...prev, project]);
      setActiveId(project.id);
      setActiveStage("dates");
      if (result.errors.length > 0 || usedFallback) {
        const prefix = usedFallback
          ? "That CSV didn't match the standard template, so it was read with the smarter extractor instead. "
          : "";
        const noteText = result.errors.length > 0 ? ` Notes: ${result.errors.join(" ")}` : "";
        setError(`${prefix}Imported ${result.people.length} people and ${result.locations.length} location(s) — double-check before sending outreach.${noteText}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that file.");
    }
    setLoading(false);
  }

  async function handleFollowUp() {
    if (!activeProject || !message.trim() || loading) return;
    const text = message.trim();
    setMessage("");
    await submitToPipeline(activeProject, [{ text }]);
  }

  async function handleViewSourceDocument() {
    if (!activeProject?.sourceDocument) return;
    const url = await dataUrlToObjectUrl(activeProject.sourceDocument.dataUrl);
    window.open(url, "_blank");
    // The new tab has its own reference to the blob's bytes once opened;
    // revoking shortly after just frees this object URL, not the tab's view.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
    const projectTitle = activeProject.breakdown?.project_name || humanizeFileName(activeProject.name);
    const done = doneMap(activeProject);

    return (
      <div className="flex min-h-full flex-col bg-bg">
        <header className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveId(null)}
              className="tracked rounded-full border border-edge px-4 py-2 text-xs text-dim uppercase transition hover:text-ink"
            >
              ← Dashboard
            </button>
            <span className="tracked text-sm font-medium uppercase text-ink">{projectTitle}</span>
            {activeProject.sourceDocument && (
              <button
                onClick={handleViewSourceDocument}
                title={activeProject.sourceDocument.name}
                className="tracked rounded-full border border-edge px-4 py-2 text-xs text-dim uppercase transition hover:text-ink"
              >
                View original document
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
            <span
              className="title-gradient text-lg uppercase"
              style={{ fontFamily: "var(--font-display)" }}
            >
              VantageTime
            </span>
          </div>
        </header>
        <div className="filmstrip" />

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
            <p className="mb-6 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-700">
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
            (activeProject.breakdown && activeProject.schedule ? (
              <AvailabilitySection
                sessionId={activeProject.sessionId}
                projectName={projectTitle}
                breakdown={activeProject.breakdown}
                schedule={activeProject.schedule}
                crew={activeProject.crew ?? []}
                otherItems={activeProject.otherItems ?? []}
                castEmails={activeProject.castEmails ?? {}}
                castPriority={activeProject.castPriority ?? {}}
                castAvailabilityNote={activeProject.castAvailabilityNote ?? {}}
                availabilityLinks={activeProject.availabilityLinks ?? {}}
                locationAvailability={activeProject.locationAvailability ?? {}}
                locationResearch={activeProject.locationResearch}
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
                locationResearch={activeProject.locationResearch}
                updatedAt={activeProject.updatedAt}
                castOutreach={activeProject.castOutreach}
                castEmails={activeProject.castEmails ?? {}}
                castPriority={activeProject.castPriority ?? {}}
                crew={activeProject.crew ?? []}
                availabilityLinks={activeProject.availabilityLinks ?? {}}
                proposedPeriod={activeProject.proposedPeriod ?? null}
                locationAvailability={activeProject.locationAvailability ?? {}}
                otherItems={activeProject.otherItems ?? []}
                onUpdateCastEmails={(castEmails) => updateProject(activeProject.id, { castEmails })}
                onUpdateCastPriority={(castPriority) => updateProject(activeProject.id, { castPriority })}
                onRenameCastMember={renameCastMember}
                onUpdateCastRole={updateCastRole}
                onAddCastMember={addCastMember}
                onRemoveCastMember={removeCastMember}
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
                onSetShootWindow={handleSetShootWindow}
                onUpdateSchedule={(schedule) => updateProject(activeProject.id, { schedule })}
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
                castAvailabilityNote={activeProject.castAvailabilityNote ?? {}}
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
              className="btn-poster rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </main>

        <ChatPanel
          key={activeProject.id}
          project={activeProject}
          threads={activeProject.chatThreads ?? []}
          onUpdateThreads={(chatThreads) => updateProject(activeProject.id, { chatThreads })}
          onAction={applyChatAction}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
          <span
            className="title-gradient text-lg uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            VantageTime
          </span>
        </div>
        <nav className="tracked flex items-center gap-8 text-xs text-dim uppercase">
          <span>Productions</span>
        </nav>
      </header>
      <div className="filmstrip" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-12">
        <div className="tracked mb-4 text-xs text-dim uppercase">Your Projects</div>

        {error && (
          <p className="mb-4 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-700">
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
                setActiveStage(p.startedFrom === "roster" ? "dates" : "breakdown");
              }}
            />
          ))}

          <div>
            <div className="tracked mb-3 text-xs text-dim uppercase">How would you like to start?</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                className="group rounded-2xl border-2 border-dashed border-edge px-6 py-8 text-left transition hover:border-accent hover:shadow-[0_16px_36px_-20px_rgba(217,100,10,0.5)] disabled:opacity-50"
              >
                <ScriptIcon />
                <div className="mt-3 text-sm font-semibold text-ink transition group-hover:text-accent">
                  I have a script
                </div>
                <div className="mt-1 text-xs text-faint">
                  {loading ? "Uploading..." : "Upload a script PDF — we'll break it down into scenes, cast, locations, and a validated shoot schedule automatically."}
                </div>
              </button>

              <input
                ref={rosterInputRef}
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRosterUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => rosterInputRef.current?.click()}
                disabled={loading}
                className="group rounded-2xl border-2 border-dashed border-edge px-6 py-8 text-left transition hover:border-mint hover:shadow-[0_16px_36px_-20px_rgba(14,143,114,0.5)] disabled:opacity-50"
              >
                <SpreadsheetIcon />
                <div className="mt-3 text-sm font-semibold text-ink transition group-hover:text-mint">
                  I have production data
                </div>
                <div className="mt-1 text-xs text-faint">
                  {loading
                    ? "Importing..."
                    : "Upload a cast/crew/location spreadsheet (CSV) or a casting/crew list (PDF) — we'll build your roster and go straight to picking dates."}
                </div>
              </button>
            </div>
            <button
              onClick={downloadRosterTemplate}
              className="tracked mt-3 text-[11px] text-faint underline underline-offset-2 hover:text-accent"
            >
              Download the CSV template
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
