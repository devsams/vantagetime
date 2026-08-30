"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import { emptyTask, TASK_PRIORITY_LABEL, TASK_PRIORITY_RANK, TASK_PRIORITY_STYLE, TASK_QUICK_TEMPLATES, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "@/lib/tasks";
import { friendlyDate } from "@/lib/text";
import { CastMember, CrewMember, Task, TaskPriority, TaskStatus } from "@/lib/types";

interface AssigneeOption {
  name: string;
  type: "Cast" | "Crew";
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (TASK_PRIORITY_RANK[a.priority] !== TASK_PRIORITY_RANK[b.priority]) {
      return TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority];
    }
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt - b.createdAt;
  });
}

export default function TaskMasterSection({
  tasks,
  cast,
  crew,
  locations,
  shootDayNumbers,
  onUpdateTasks,
}: {
  tasks: Task[];
  cast: CastMember[];
  crew: CrewMember[];
  locations: string[];
  shootDayNumbers: number[];
  onUpdateTasks: (tasks: Task[]) => void;
}) {
  const [draft, setDraft] = useState<Task | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const assigneeOptions: AssigneeOption[] = [
    ...cast.map((c) => ({ name: c.name, type: "Cast" as const })),
    ...crew.map((c) => ({ name: c.name, type: "Crew" as const })),
  ];

  function startQuickTask(title: string, description: string) {
    setEditingId(null);
    setDraft({ ...emptyTask(), title, description });
  }

  function startCustomTask() {
    setEditingId(null);
    setDraft(emptyTask());
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setDraft({ ...task });
  }

  function cancelDraft() {
    setDraft(null);
    setEditingId(null);
  }

  function saveDraft() {
    if (!draft || !draft.title.trim()) return;
    const now = Date.now();
    if (editingId) {
      onUpdateTasks(tasks.map((t) => (t.id === editingId ? { ...draft, updatedAt: now } : t)));
    } else {
      onUpdateTasks([...tasks, { ...draft, updatedAt: now }]);
    }
    setDraft(null);
    setEditingId(null);
  }

  function setStatus(id: string, status: TaskStatus) {
    onUpdateTasks(tasks.map((t) => (t.id === id ? { ...t, status, updatedAt: Date.now() } : t)));
  }

  function removeTask(id: string) {
    onUpdateTasks(tasks.filter((t) => t.id !== id));
    if (editingId === id) cancelDraft();
  }

  function patchDraft(patch: Partial<Task>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  return (
    <div>
      <StageHeader
        index={6}
        title="Task Master"
        description="Real work, assigned to a real person on the roster — with a status, due date, location, and priority. Replaces the old free-text day notes on the Call Sheet."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TASK_QUICK_TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => startQuickTask(t.title, t.description)}
            className="tracked rounded-full border border-edge px-3 py-1.5 text-[10px] uppercase text-faint transition hover:border-accent hover:text-accent"
          >
            + {t.title}
          </button>
        ))}
        <button
          onClick={startCustomTask}
          className="tracked rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[10px] uppercase text-accent transition hover:bg-accent/20"
        >
          + Custom task
        </button>
      </div>

      {draft && (
        <div className="mb-6 rounded-xl border border-accent/40 bg-panel p-4">
          <div className="tracked mb-3 text-[10px] text-faint uppercase">
            {editingId ? "Edit task" : "New task"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] text-faint">Title</span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
                placeholder="e.g. Confirm Steadicam rental for Day 3"
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] text-faint">Description</span>
              <textarea
                value={draft.description}
                onChange={(e) => patchDraft({ description: e.target.value })}
                rows={2}
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">Assignee</span>
              <select
                value={draft.assignee}
                onChange={(e) => {
                  const opt = assigneeOptions.find((o) => o.name === e.target.value);
                  patchDraft({ assignee: e.target.value, assigneeType: opt?.type ?? "" });
                }}
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              >
                <option value="">Unassigned</option>
                {cast.length > 0 && (
                  <optgroup label="Cast">
                    {cast.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {crew.length > 0 && (
                  <optgroup label="Crew">
                    {crew.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">Status</span>
              <select
                value={draft.status}
                onChange={(e) => patchDraft({ status: e.target.value as TaskStatus })}
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              >
                {TASK_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">Due date</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => patchDraft({ dueDate: e.target.value })}
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">Priority</span>
              <select
                value={draft.priority}
                onChange={(e) => patchDraft({ priority: e.target.value as TaskPriority })}
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
              >
                {(["high", "medium", "low"] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-faint">Location</span>
              <input
                type="text"
                list="task-location-options"
                value={draft.location}
                onChange={(e) => patchDraft({ location: e.target.value })}
                placeholder="e.g. Zilker Park Bench"
                className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <datalist id="task-location-options">
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            {shootDayNumbers.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-faint">Shoot day</span>
                <select
                  value={draft.dayNumber ?? ""}
                  onChange={(e) =>
                    patchDraft({ dayNumber: e.target.value ? Number(e.target.value) : null })
                  }
                  className="rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                >
                  <option value="">—</option>
                  {shootDayNumbers.map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={saveDraft}
              disabled={!draft.title.trim()}
              className="btn-poster rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
            >
              {editingId ? "Save changes" : "Add task"}
            </button>
            <button
              onClick={cancelDraft}
              className="tracked rounded-full border border-edge px-4 py-1.5 text-xs text-faint uppercase transition hover:text-dim"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TASK_STATUS_ORDER.map((status) => {
          const columnTasks = sortTasks(tasks.filter((t) => t.status === status));
          return (
            <div key={status}>
              <div className="tracked mb-3 flex items-center justify-between text-[10px] text-faint uppercase">
                <span>{TASK_STATUS_LABEL[status]}</span>
                <span>{columnTasks.length}</span>
              </div>
              <div className="space-y-3">
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-xl border-l-4 border border-edge bg-panel p-3 ${
                      t.priority === "high"
                        ? "border-l-coral"
                        : t.priority === "medium"
                          ? "border-l-amber"
                          : "border-l-edge"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-left text-xs font-medium text-ink transition hover:text-accent"
                      >
                        {t.title}
                      </button>
                      <button
                        onClick={() => removeTask(t.id)}
                        title="Delete task"
                        className="shrink-0 text-sm text-faint transition hover:text-coral"
                      >
                        ×
                      </button>
                    </div>
                    {t.description && <p className="mt-1 text-[11px] text-dim">{t.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.assignee && (
                        <span className="tracked rounded-full bg-panel2 px-2 py-0.5 text-[9px] uppercase text-dim">
                          {t.assignee}
                          {t.assigneeType && ` · ${t.assigneeType}`}
                        </span>
                      )}
                      {t.dayNumber !== null && (
                        <span className="tracked rounded-full bg-panel2 px-2 py-0.5 text-[9px] uppercase text-dim">
                          Day {t.dayNumber}
                        </span>
                      )}
                      <span
                        className={`tracked rounded-full border px-2 py-0.5 text-[9px] uppercase ${TASK_PRIORITY_STYLE[t.priority]}`}
                      >
                        {TASK_PRIORITY_LABEL[t.priority]}
                      </span>
                      {t.dueDate && (
                        <span className="tracked rounded-full bg-panel2 px-2 py-0.5 text-[9px] uppercase text-dim">
                          Due {friendlyDate(t.dueDate)}
                        </span>
                      )}
                      {t.location && (
                        <span className="tracked rounded-full bg-panel2 px-2 py-0.5 text-[9px] uppercase text-dim">
                          {t.location}
                        </span>
                      )}
                    </div>
                    <select
                      value={t.status}
                      onChange={(e) => setStatus(t.id, e.target.value as TaskStatus)}
                      className="tracked mt-2 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[10px] uppercase text-dim focus:border-accent focus:outline-none"
                    >
                      {TASK_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          Move to {TASK_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-edge px-3 py-6 text-center text-[11px] text-faint">
                    No tasks here.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
