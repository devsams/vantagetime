"use client";

import { useEffect, useRef, useState } from "react";
import AttentionBar from "@/components/AttentionBar";
import AutopilotSection from "@/components/AutopilotSection";
import AvailabilitySection from "@/components/AvailabilitySection";
import BreakdownSection from "@/components/BreakdownSection";
import CallSheetSection from "@/components/CallSheetSection";
import ChatPanel from "@/components/ChatPanel";
import DatesSection from "@/components/DatesSection";
import { ScriptIcon, SpreadsheetIcon } from "@/components/EntryIcons";
import MembersSection from "@/components/MembersSection";
import SettingsSection from "@/components/SettingsSection";
import StagePill from "@/components/StagePill";
import StageTabs from "@/components/StageTabs";
import TaskMasterSection from "@/components/TaskMasterSection";
import TimeCardsSection from "@/components/TimeCardsSection";
import {
  deleteProjectRemote,
  extractRosterFromDocument,
  fetchProjectsRemote,
  fetchSettingsRemote,
  fileToBase64,
  importRoster,
  putSettingsRemote,
  runPipeline,
  upsertProjectRemote,
} from "@/lib/api";
import { emptyProductionInfo } from "@/lib/callSheetExtras";
import { dataUrlToObjectUrl, shouldStoreDocument, toDataUrl } from "@/lib/files";
import { computeAttentionItems } from "@/lib/attention";
import { applyRosterImport } from "@/lib/rosterProject";
import { downloadRosterTemplate } from "@/lib/rosterTemplate";
import { emptySettings, emptyTeamMember } from "@/lib/settings";
import { loadProjects, loadSettings, saveProjects, saveSettings } from "@/lib/storage";
import { humanizeFileName } from "@/lib/text";
import {
  AppSettings,
  ChatAction,
  CompanyProfile,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  Project,
  ProjectStatus,
  STAGE_LABELS,
  STAGE_ORDER,
  StageKey,
  TeamMember,
} from "@/lib/types";

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
    tasks: [],
    payRates: {},
    timeCards: [],
    locationOutreach: {},
    status: "inProgress",
  };
}

function stageDone(project: Project, key: StageKey): boolean {
  switch (key) {
    case "autopilot":
      // No real "done" state of its own — it's a guided view over the
      // other stages, not a milestone. Treat it as done once the plan
      // it walks you to is itself done.
      return stageDone(project, "callSheet") && (project.schedule?.shoot_days.some((d) => d.date) ?? false);
    case "breakdown":
      return !!project.breakdown;
    case "members":
      return (
        (project.breakdown?.cast.length ?? 0) > 0 ||
        (project.crew ?? []).length > 0 ||
        (project.otherItems ?? []).length > 0
      );
    case "callSheet":
      return !!project.callSheets && project.callSheets.call_sheets.length > 0;
    case "dates":
      // "Dates" now covers scheduling/validation + location research +
      // roster/outreach + the real per-day calendar — done once real
      // dates are actually assigned, the end of that whole flow.
      return project.schedule?.shoot_days.some((d) => d.date) ?? false;
    case "dashboard":
      // The dashboard itself has no "done" state — treat it as done once
      // outreach has actually gone out to at least one person.
      return Object.keys(project.availabilityLinks ?? {}).length > 0;
    case "tasks":
      // Done once every task that's been created has actually been
      // wrapped — not just "some tasks exist".
      return (project.tasks ?? []).length > 0 && (project.tasks ?? []).every((t) => t.status === "done");
    case "payroll":
      // Done once every time card that's been logged has actually been
      // approved — not just "some hours were logged".
      return (
        (project.timeCards ?? []).length > 0 && (project.timeCards ?? []).every((t) => t.status === "approved")
      );
    default:
      return false;
  }
}

function doneMap(project: Project): Record<StageKey, boolean> {
  return {
    autopilot: stageDone(project, "autopilot"),
    breakdown: stageDone(project, "breakdown"),
    members: stageDone(project, "members"),
    callSheet: stageDone(project, "callSheet"),
    dates: stageDone(project, "dates"),
    tasks: stageDone(project, "tasks"),
    payroll: stageDone(project, "payroll"),
    dashboard: stageDone(project, "dashboard"),
  };
}

const PROJECT_STATUS_BADGE_STYLE: Record<ProjectStatus, string> = {
  live: "border-mint/50 bg-mint/10 text-mint",
  inProgress: "border-accent/50 bg-accent/10 text-accent",
  archived: "border-edge text-faint",
};

function ProjectCard({
  project,
  onOpen,
  onSetStatus,
}: {
  project: Project;
  onOpen: () => void;
  onSetStatus: (status: ProjectStatus) => void;
}) {
  const stats = project.breakdown
    ? [
        { value: project.breakdown.scene_count, label: "Scenes" },
        { value: project.schedule?.shoot_days.length ?? 0, label: "Shoot Days" },
        { value: project.breakdown.locations.length, label: "Locations" },
        { value: project.breakdown.cast.length, label: "Cast" },
      ]
    : [];

  return (
    <div
      className={`rounded-2xl border border-edge bg-panel p-8 shadow-[0_20px_50px_-30px_rgba(23,19,13,0.35)] ${
        project.status === "archived" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="tracked text-xs font-medium text-accent uppercase">
              {project.startedFrom === "roster" ? "From spreadsheet" : project.breakdown?.format ?? "Processing"}
            </div>
            <span
              className={`tracked rounded-full border px-2 py-0.5 text-[10px] uppercase ${PROJECT_STATUS_BADGE_STYLE[project.status]}`}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onOpen}
            className="btn-poster rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Open Project →
          </button>
          <select
            value={project.status}
            onChange={(e) => onSetStatus(e.target.value as ProjectStatus)}
            title="Status"
            className="tracked rounded-full border border-edge bg-panel px-3 py-2.5 text-xs text-dim uppercase transition hover:text-ink focus:border-accent focus:outline-none"
          >
            {PROJECT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
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
  const [activeStage, setActiveStage] = useState<StageKey>("callSheet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rosterInputRef = useRef<HTMLInputElement>(null);
  const [projectTab, setProjectTab] = useState<ProjectStatus>("inProgress");
  const [dashboardView, setDashboardView] = useState<"projects" | "settings">("projects");
  const [settings, setSettings] = useState<AppSettings>(emptySettings());
  // True once the one-time backend reconcile below has run (success or
  // best-effort failure) — gates the outgoing sync effects further down
  // so they can't race the reconcile and push stale local data over
  // real backend data on first load.
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    const localProjects = loadProjects();
    const localSettings = loadSettings();
    setProjects(localProjects);
    setSettings(localSettings);
    setHydrated(true);

    // Reconcile with the durable backend copy — see lib/api.ts and
    // backend/common/project_store.py. localStorage is only ever a fast
    // local cache now; this is what actually protects against losing a
    // project if the browser's storage is cleared or a device is
    // switched. Best-effort: if the backend can't be reached, the app
    // keeps working from the local cache exactly as it always did.
    (async () => {
      try {
        const remoteProjects = await fetchProjectsRemote();
        if (remoteProjects.length > 0) {
          setProjects(remoteProjects);
        } else if (localProjects.length > 0) {
          // Nothing in the backend yet, but this browser already has
          // projects from before this feature shipped — push them up
          // once so they're not stuck local-only forever.
          await Promise.all(localProjects.map((p) => upsertProjectRemote(p)));
        }
      } catch {
        // Backend unreachable — proceed local-only.
      }
      try {
        const remoteSettings = await fetchSettingsRemote();
        if (remoteSettings) {
          setSettings(remoteSettings);
        } else {
          await putSettingsRemote(localSettings);
        }
      } catch {
        // Backend unreachable — proceed local-only.
      }
      setBackendReady(true);
    })();
  }, []);

  useEffect(() => {
    if (hydrated) saveProjects(projects);
  }, [projects, hydrated]);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  // Keeps the backend in sync on every change, same trigger as the
  // localStorage save above. Strips the (large) sourceDocument dataUrl
  // from routine syncs — the backend already has it from the initial
  // upload and preserves it automatically when it's omitted (see
  // project_store.py's _preserve_source_document) — so this never
  // resends a multi-hundred-KB PDF just because a task got added.
  useEffect(() => {
    if (!backendReady) return;
    projects.forEach((p) => {
      const syncPayload = p.sourceDocument
        ? { ...p, sourceDocument: { name: p.sourceDocument.name, mimeType: p.sourceDocument.mimeType } }
        : p;
      upsertProjectRemote(syncPayload).catch(() => {
        // Best-effort — localStorage still has the real data; this
        // effect re-fires on every subsequent change, so the next
        // successful sync catches it back up automatically.
      });
    });
  }, [projects, backendReady]);

  useEffect(() => {
    if (!backendReady) return;
    putSettingsRemote(settings).catch(() => {
      // Same fallback reasoning as the project sync above.
    });
  }, [settings, backendReady]);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;
  const liveProjects = projects.filter((p) => p.status === "live");
  const inProgressProjects = projects.filter((p) => p.status === "inProgress");
  const archivedProjects = projects.filter((p) => p.status === "archived");
  const projectsByStatus: Record<ProjectStatus, Project[]> = {
    live: liveProjects,
    inProgress: inProgressProjects,
    archived: archivedProjects,
  };

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
    // The one time the full sourceDocument (including its dataUrl) needs
    // to actually reach the backend — every sync after this strips it
    // out to avoid resending a multi-hundred-KB PDF on every save (see
    // the generic sync effect above and _preserve_source_document
    // backend-side, which keeps this once it's here).
    upsertProjectRemote(project).catch(() => {});

    await submitToPipeline(project, [
      { text: "Break this script down and build a validated shoot schedule." },
      { inlineData: { displayName: file.name, data, mimeType: "application/pdf" } },
    ]);

    // Land on Autopilot once the breakdown is in, not Call Sheet — this is
    // the one moment the checklist of what's missing (cast emails, location
    // contacts, blocked research) is actually useful to see immediately,
    // rather than making the user go find the tab themselves.
    setActiveStage("autopilot");
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
      // Same reasoning as the script path: land on Autopilot so gaps in the
      // imported roster (missing emails, location contacts) are flagged
      // immediately instead of only surfacing later in Dates.
      setActiveStage("autopilot");
      // Same one-time full-document push as the script upload path — see
      // the comment there.
      upsertProjectRemote(project).catch(() => {});
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

  async function handleRequestReschedule(text: string) {
    if (!activeProject || !text.trim() || loading) return;
    await submitToPipeline(activeProject, [{ text: text.trim() }]);
  }

  async function handleViewSourceDocument() {
    if (!activeProject?.sourceDocument) return;
    const url = await dataUrlToObjectUrl(activeProject.sourceDocument.dataUrl);
    window.open(url, "_blank");
    // The new tab has its own reference to the blob's bytes once opened;
    // revoking shortly after just frees this object URL, not the tab's view.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function handleDownloadSourceDocument() {
    if (!activeProject?.sourceDocument) return;
    const url = await dataUrlToObjectUrl(activeProject.sourceDocument.dataUrl);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeProject.sourceDocument.name;
    a.click();
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

  function handleSetProjectStatus(id: string, status: ProjectStatus) {
    updateProject(id, { status });
    if (status === "archived" && activeId === id) setActiveId(null);
  }

  function updateCompanyProfile(companyProfile: CompanyProfile) {
    setSettings((prev) => ({ ...prev, companyProfile }));
  }

  function addTeamMember() {
    setSettings((prev) => ({
      ...prev,
      team: [...prev.team, emptyTeamMember(crypto.randomUUID())],
    }));
  }

  function updateTeamMember(id: string, patch: Partial<TeamMember>) {
    setSettings((prev) => ({
      ...prev,
      team: prev.team.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  function removeTeamMember(id: string) {
    setSettings((prev) => ({ ...prev, team: prev.team.filter((m) => m.id !== id) }));
  }

  function handleClearAllData() {
    if (
      !window.confirm(
        "Clear all data? This permanently deletes every project and your settings, from this browser and from the backend. This can't be undone."
      )
    ) {
      return;
    }
    // Best-effort backend cleanup — mirrors what's about to happen to
    // local state below. A failure here just leaves a stale backend
    // copy around rather than blocking the local clear the user asked
    // for; nothing critical, just less tidy.
    projects.forEach((p) => {
      deleteProjectRemote(p.id).catch(() => {});
    });
    setProjects([]);
    setSettings(emptySettings());
    setActiveId(null);
  }

  if (activeProject) {
    const projectTitle = activeProject.breakdown?.project_name || humanizeFileName(activeProject.name);
    const done = doneMap(activeProject);
    const attentionItems = computeAttentionItems(activeProject);

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
            {activeProject.status !== "archived" && (
              <button
                onClick={() => {
                  if (
                    window.confirm(`Archive "${projectTitle}"? You can move it back from the dashboard.`)
                  ) {
                    handleSetProjectStatus(activeProject.id, "archived");
                  }
                }}
                className="tracked rounded-full border border-edge px-4 py-2 text-xs text-dim uppercase transition hover:text-ink"
              >
                Archive
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
        <AttentionBar items={attentionItems} onOpenAutopilot={() => setActiveStage("autopilot")} />
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

          {activeStage === "autopilot" && (
            <AutopilotSection
              projectName={projectTitle}
              sessionId={activeProject.sessionId}
              breakdown={activeProject.breakdown}
              schedule={activeProject.schedule}
              callSheets={activeProject.callSheets}
              crew={activeProject.crew ?? []}
              castEmails={activeProject.castEmails ?? {}}
              castPriority={activeProject.castPriority ?? {}}
              availabilityLinks={activeProject.availabilityLinks ?? {}}
              proposedPeriod={activeProject.proposedPeriod ?? null}
              locationAvailability={activeProject.locationAvailability ?? {}}
              locationResearch={activeProject.locationResearch ?? {}}
              castOutreach={activeProject.castOutreach}
              locationOutreach={activeProject.locationOutreach ?? {}}
              tasks={activeProject.tasks ?? []}
              timeCards={activeProject.timeCards ?? []}
              payRates={activeProject.payRates ?? {}}
              onUpdateLocationOutreach={(locationOutreach) =>
                updateProject(activeProject.id, { locationOutreach })
              }
              onUpdateCastEmails={(castEmails) => updateProject(activeProject.id, { castEmails })}
              onUpdateLocationAvailability={(locationAvailability) =>
                updateProject(activeProject.id, { locationAvailability })
              }
              onLinksGenerated={(links) =>
                updateProject(activeProject.id, {
                  availabilityLinks: { ...(activeProject.availabilityLinks ?? {}), ...links },
                })
              }
              onGoToStage={setActiveStage}
            />
          )}

          {activeStage === "breakdown" &&
            (activeProject.breakdown ? (
              <BreakdownSection
                breakdown={activeProject.breakdown}
                sourceDocument={activeProject.sourceDocument}
                onViewSourceDocument={handleViewSourceDocument}
                onDownloadSourceDocument={handleDownloadSourceDocument}
              />
            ) : (
              <p className="text-sm text-faint">No breakdown yet.</p>
            ))}

          {activeStage === "members" && (
            <MembersSection
              cast={activeProject.breakdown?.cast ?? []}
              crew={activeProject.crew ?? []}
              otherItems={activeProject.otherItems ?? []}
              castEmails={activeProject.castEmails ?? {}}
              onAddCastMember={addCastMember}
              onUpdateCastRole={updateCastRole}
              onRemoveCastMember={removeCastMember}
              onUpdateCastEmails={(castEmails) => updateProject(activeProject.id, { castEmails })}
              onAddCrewMember={addCrewMember}
              onUpdateCrewMember={updateCrewMember}
              onRemoveCrewMember={removeCrewMember}
              onUpdateOtherItems={(otherItems) => updateProject(activeProject.id, { otherItems })}
            />
          )}

          {activeStage === "callSheet" &&
            (activeProject.callSheets && activeProject.callSheets.call_sheets.length > 0 ? (
              <CallSheetSection
                callSheets={activeProject.callSheets}
                projectName={projectTitle}
                locationAvailability={activeProject.locationAvailability ?? {}}
                productionInfo={activeProject.productionInfo ?? emptyProductionInfo()}
                onUpdateProductionInfo={(productionInfo) =>
                  updateProject(activeProject.id, { productionInfo })
                }
              />
            ) : (
              <p className="text-sm text-faint">No call sheet yet.</p>
            ))}

          {activeStage === "tasks" && (
            <TaskMasterSection
              tasks={activeProject.tasks ?? []}
              cast={activeProject.breakdown?.cast ?? []}
              crew={activeProject.crew ?? []}
              locations={(activeProject.breakdown?.locations ?? []).map((l) => l.name)}
              shootDayNumbers={activeProject.schedule?.shoot_days.map((d) => d.day_number) ?? []}
              onUpdateTasks={(tasks) => updateProject(activeProject.id, { tasks })}
            />
          )}

          {activeStage === "payroll" && (
            <TimeCardsSection
              projectName={projectTitle}
              cast={activeProject.breakdown?.cast ?? []}
              crew={activeProject.crew ?? []}
              shootDays={activeProject.schedule?.shoot_days ?? []}
              timeCards={activeProject.timeCards ?? []}
              payRates={activeProject.payRates ?? {}}
              onUpdateTimeCards={(timeCards) => updateProject(activeProject.id, { timeCards })}
              onUpdatePayRates={(payRates) => updateProject(activeProject.id, { payRates })}
            />
          )}

          {activeStage === "dashboard" &&
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
                onRequestReschedule={handleRequestReschedule}
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
        <nav className="tracked flex items-center gap-8 text-xs uppercase">
          <button
            onClick={() => setDashboardView("projects")}
            className={dashboardView === "projects" ? "text-ink" : "text-dim transition hover:text-ink"}
          >
            Productions
          </button>
          <button
            onClick={() => setDashboardView("settings")}
            className={dashboardView === "settings" ? "text-ink" : "text-dim transition hover:text-ink"}
          >
            Settings
          </button>
        </nav>
      </header>
      <div className="filmstrip" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-12">
        {dashboardView === "settings" ? (
          <SettingsSection
            companyProfile={settings.companyProfile}
            team={settings.team}
            activeProjectCount={liveProjects.length + inProgressProjects.length}
            archivedProjectCount={archivedProjects.length}
            onUpdateCompanyProfile={updateCompanyProfile}
            onAddTeamMember={addTeamMember}
            onUpdateTeamMember={updateTeamMember}
            onRemoveTeamMember={removeTeamMember}
            onClearAllData={handleClearAllData}
          />
        ) : (
          <>
        <div className="tracked mb-4 text-xs text-dim uppercase">Your Projects</div>

        {error && (
          <p className="mb-4 rounded-md border-l-2 border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {PROJECT_STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setProjectTab(s)}
              className={`tracked rounded-full border px-4 py-1.5 text-xs uppercase transition ${
                projectTab === s ? PROJECT_STATUS_BADGE_STYLE[s] : "border-edge text-faint hover:text-dim"
              }`}
            >
              {PROJECT_STATUS_LABELS[s]} ({projectsByStatus[s].length})
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          {projectsByStatus[projectTab].map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => {
                setActiveId(p.id);
                setActiveStage("autopilot");
              }}
              onSetStatus={(status) => handleSetProjectStatus(p.id, status)}
            />
          ))}

          {projectsByStatus[projectTab].length === 0 && (
            <p className="rounded-2xl border border-dashed border-edge px-6 py-10 text-center text-sm text-faint">
              No {PROJECT_STATUS_LABELS[projectTab].toLowerCase()} projects yet.
            </p>
          )}

          {projectTab !== "archived" && (
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
          )}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
