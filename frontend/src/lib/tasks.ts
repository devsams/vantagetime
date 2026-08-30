import { Task, TaskPriority, TaskStatus } from "./types";

export function emptyTask(): Task {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    assignee: "",
    assigneeType: "",
    status: "todo",
    dueDate: "",
    location: "",
    priority: "medium",
    dayNumber: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TASK_PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: "border-coral/50 bg-coral/10 text-coral",
  medium: "border-amber/50 bg-amber/10 text-amber",
  low: "border-edge bg-panel2 text-faint",
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Quick-start titles pulled straight from the old Call Sheet
 * "Additional day notes" fixed fields — that free-text feature had no
 * assignee, status, or due date of its own, so it's moved here: a
 * click prefills the title/description of a real, assignable task
 * instead of just being a text box nobody owns. */
export const TASK_QUICK_TEMPLATES: { title: string; description: string }[] = [
  {
    title: "Advance Call / Next-Day Schedule",
    description: "Tomorrow's preview: scenes, sets, and cast needed — for overnight prep.",
  },
  {
    title: "Special Equipment & Department Notes",
    description: "e.g. Steadicam required. SFX explosion scene 4. Rain machine on set.",
  },
  {
    title: "Parking & Shuttles",
    description: "On/off-site parking instructions and shuttle run times.",
  },
  {
    title: "Company Move Schedule",
    description: "Timeline and directions if moving between locations mid-day.",
  },
  {
    title: "Background / Extras",
    description: "Headcount, arrival time, holding area, wardrobe requirements.",
  },
  {
    title: "Cast Pick-Up & Transport",
    description: "Driver schedule — who's picked up, from where, at what time.",
  },
  {
    title: "Stand-Ins & Stunt Doubles",
    description: "Arrival times, wardrobe, and assignment notes.",
  },
  {
    title: "Minor / Child Actor Rules",
    description: "Child-labor compliance, tutor hours, legal max working hours.",
  },
];
