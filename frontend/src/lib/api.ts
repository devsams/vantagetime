import type {
  ActorView,
  AppSettings,
  Breakdown,
  Cancellation,
  CallSheets,
  CastOutreach,
  ChatAction,
  Confirmation,
  DateProposal,
  DateWindow,
  FeedStep,
  LocationResearch,
  OutreachScheduledDay,
  Project,
  ProposedPeriod,
  Schedule,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const APP_NAME = "orchestrator";
const USER_ID = "web_user";

export type MessagePart =
  | { text: string }
  | { inlineData: { displayName: string; data: string; mimeType: string } };

/** Reads a File into a base64 string (no "data:...;base64," prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Keyed by "appName:sessionId", not just sessionId — a roster-only
// project's sessionId is only ever used against one ADK app in
// practice, but a project that later imports BOTH a script (orchestrator)
// and a production-data document (roster_extractor) reuses the same
// sessionId across two different apps, and each needs its own session
// created server-side.
const createdSessions = new Set<string>();

async function ensureSession(appName: string, sessionId: string) {
  const key = `${appName}:${sessionId}`;
  if (createdSessions.has(key)) return;
  createdSessions.add(key);
  try {
    await fetch(`${API_BASE}/apps/${appName}/users/${USER_ID}/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // If this fails, the /run call below will surface the real error.
  }
}

/** The agents are instructed to return raw JSON, but strip accidental
 * ```json fences defensively in case the model wraps it anyway. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    return null;
  }
}

export interface PipelineResult {
  breakdown?: Breakdown;
  schedule?: Schedule;
  locationResearch: Record<number, LocationResearch>;
  callSheets?: CallSheets;
  castOutreach?: CastOutreach;
  feed: FeedStep[];
  ok: boolean;
  error?: string;
}

const LOCATION_AGENT_RE = /^location_research_agent_(\d+)$/;

export async function runPipeline(
  sessionId: string,
  parts: MessagePart[]
): Promise<PipelineResult> {
  await ensureSession(APP_NAME, sessionId);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName: APP_NAME,
        userId: USER_ID,
        sessionId,
        newMessage: { role: "user", parts },
      }),
    });
  } catch (e) {
    return {
      locationResearch: {},
      feed: [],
      ok: false,
      error: `Could not reach the backend — is it running? (${e})`,
    };
  }

  if (!res.ok) {
    return {
      locationResearch: {},
      feed: [],
      ok: false,
      error: `Backend returned ${res.status}`,
    };
  }

  const events = await res.json();
  const result: PipelineResult = { locationResearch: {}, feed: [], ok: true };

  for (const event of events) {
    const author: string | undefined = event?.author;
    const textPart = event?.content?.parts?.find((p: { text?: string }) => p?.text);
    const text: string | undefined = textPart?.text;
    if (!author || !text) continue;

    result.feed.push({ agent: author, text });

    if (author === "script_breakdown_agent") {
      const parsed = tryParse<Breakdown>(text);
      if (parsed) result.breakdown = parsed;
    } else if (author === "scheduling_agent") {
      const parsed = tryParse<Schedule>(text);
      if (parsed) result.schedule = parsed;
    } else if (author === "call_sheet_generator") {
      const parsed = tryParse<CallSheets>(text);
      if (parsed) result.callSheets = parsed;
    } else if (author === "availability_agent") {
      const parsed = tryParse<CastOutreach>(text);
      if (parsed) result.castOutreach = parsed;
    } else {
      const match = author.match(LOCATION_AGENT_RE);
      if (match) {
        const parsed = tryParse<LocationResearch>(text);
        if (parsed) result.locationResearch[Number(match[1])] = parsed;
      }
    }
  }

  return result;
}

const ROSTER_APP_NAME = "roster_extractor";

/** The "I have production data" entry point's PDF/Word path — a
 * sibling ADK app (not a stage inside the script pipeline; see
 * backend/roster_extractor/agent.py) that reads an uploaded document
 * and returns the exact same people/locations/errors shape the
 * deterministic CSV importer produces, so applyRosterImport() never
 * needs to know which path the roster came from. */
export async function extractRosterFromDocument(
  sessionId: string,
  file: File
): Promise<RosterImportResult> {
  await ensureSession(ROSTER_APP_NAME, sessionId);
  const data = await fileToBase64(file);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName: ROSTER_APP_NAME,
        userId: USER_ID,
        sessionId,
        newMessage: {
          role: "user",
          parts: [
            { text: "Extract the roster from this production-data document." },
            { inlineData: { displayName: file.name, data, mimeType: file.type || "application/pdf" } },
          ],
        },
      }),
    });
  } catch (e) {
    throw new Error(`Could not reach the backend — is it running? (${e})`);
  }
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);

  const events = await res.json();
  for (const event of events) {
    if (event?.author !== "roster_extraction_agent") continue;
    const textPart = event?.content?.parts?.find((p: { text?: string }) => p?.text);
    const parsed = textPart?.text ? tryParse<RosterImportResult>(textPart.text) : null;
    if (parsed) return parsed;
  }
  throw new Error("The roster extraction agent didn't return a usable result.");
}

// --- Actor availability magic-link flow (plain REST, not ADK) ---

export interface RegisterActorInput {
  name: string;
  scheduled_days: OutreachScheduledDay[];
  // Optional — when all three are present the backend actually sends
  // the outreach email (via Mailpit or whatever MAILPIT_HOST points
  // at); omit any of them and registration still works, just without
  // sending.
  email?: string;
  email_subject?: string;
  email_body?: string;
  // Filmmaker-flagged priority (cast/crew/location/other all use the
  // same flag) — determines this person's place in the combined
  // cast/crew/other date-picking ladder on the backend.
  priority?: boolean;
}

export interface RegisterResult {
  links: Record<string, string>; // actor name -> token
  emailStatus: Record<string, { sent: boolean; status: string }>; // actor name -> send outcome
}

// --- Roster import: starting a production from a spreadsheet instead
// of a script (see backend/common/roster_import.py) ---

export interface RosterPerson {
  name: string;
  type: "actor" | "crew" | "other";
  role: string;
  location: string;
  availability_start: string; // "YYYY-MM-DD", empty if blank/unparsable
  availability_end: string;
  email: string;
  priority: boolean;
}

export interface RosterLocation {
  name: string;
  availability_start: string;
  availability_end: string;
}

export interface RosterImportResult {
  people: RosterPerson[];
  locations: RosterLocation[];
  errors: string[]; // row-level problems — always shown, never silently dropped
}

export async function importRoster(csvText: string): Promise<RosterImportResult> {
  const res = await fetch(`${API_BASE}/roster/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Backend returned ${res.status}`);
  }
  return res.json();
}

export async function registerAvailabilityLinks(
  sessionId: string,
  projectName: string,
  actors: RegisterActorInput[],
  proposedPeriod?: ProposedPeriod | null
): Promise<RegisterResult> {
  const res = await fetch(`${API_BASE}/availability/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      project_name: projectName,
      actors,
      proposed_period: proposedPeriod ?? null,
      frontend_base_url: typeof window !== "undefined" ? window.location.origin : "",
    }),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  const items: { name: string; token: string; email_sent: boolean; email_status: string }[] = await res.json();
  return {
    links: Object.fromEntries(items.map((i) => [i.name, i.token])),
    emailStatus: Object.fromEntries(items.map((i) => [i.name, { sent: i.email_sent, status: i.email_status }])),
  };
}

export async function fetchCancellations(sessionId: string): Promise<Cancellation[]> {
  const res = await fetch(`${API_BASE}/availability/session/${sessionId}/cancellations`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchActorView(token: string): Promise<ActorView | null> {
  const res = await fetch(`${API_BASE}/availability/${token}`);
  if (!res.ok) return null;
  return res.json();
}

/** Sends the (already-drafted, filmmaker-reviewed) location-owner
 * outreach email — see lib/locationOutreach.ts for the draft and
 * common/location_outreach_routes.py for the send. Best-effort: check
 * `.sent` rather than relying on a thrown exception. */
export async function notifyLocationOwner(
  sessionId: string,
  location: string,
  to: string,
  subject: string,
  body: string
): Promise<{ sent: boolean; reason: string | null }> {
  const res = await fetch(`${API_BASE}/locations/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, location, to, subject, body }),
  });
  if (!res.ok) return { sent: false, reason: `Backend returned ${res.status}` };
  return res.json();
}

/** The filmmaker's candidate shoot window — real dates the highest-
 * priority cast/crew/other person will pick from once outreach goes
 * out. Returns null if none has been set for this session yet. */
export async function fetchDateWindow(sessionId: string): Promise<DateWindow | null> {
  const res = await fetch(`${API_BASE}/availability/dates/${sessionId}`);
  if (!res.ok) return null;
  return res.json();
}

/** Sets (or replaces) the candidate shoot window — real date arithmetic
 * happens backend-side; replacing an existing window clears any prior
 * lock. Returns the resulting window either way (check `.error` for a
 * "nothing fits" message rather than a thrown exception). */
export async function setDateWindow(
  sessionId: string,
  start: string,
  end: string,
  blackoutDates: string[],
  numShootDays: number
): Promise<DateWindow> {
  const res = await fetch(`${API_BASE}/availability/dates/window`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      start,
      end,
      blackout_dates: blackoutDates,
      num_shoot_days: numShootDays,
    }),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

/** Locks one of the (up to 3) candidate blocks shown to this person —
 * only succeeds if they're actually next in the priority ladder and
 * nothing is locked yet; the backend is the source of truth for both.
 * Returns an error message on failure, or null on success. */
export async function lockDateWindow(
  sessionId: string,
  token: string,
  blockIndex: number
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/availability/dates/${sessionId}/lock/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ block_index: blockIndex }),
  });
  if (res.ok) return null;
  try {
    const body = await res.json();
    return typeof body?.detail === "string" ? body.detail : `Backend returned ${res.status}`;
  } catch {
    return `Backend returned ${res.status}`;
  }
}

export async function cancelDay(token: string, dayNumber: number): Promise<boolean> {
  const res = await fetch(`${API_BASE}/availability/${token}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day_number: dayNumber }),
  });
  return res.ok;
}

/** Records at least 3 real dates this person says they're available —
 * the backend rejects fewer than 3. Pass alsoCancel=true only when this
 * is a rejection of an already-assigned day; leave it false for plain
 * upfront availability-gathering before any date exists yet. Returns an
 * error message on failure, or null on success. */
export async function proposeDates(
  token: string,
  dayNumber: number,
  dates: string[],
  alsoCancel = false
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/availability/${token}/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day_number: dayNumber, dates, also_cancel: alsoCancel }),
  });
  if (res.ok) return null;
  try {
    const body = await res.json();
    const message = body?.detail?.[0]?.msg ?? body?.detail;
    return typeof message === "string" ? message : `Backend returned ${res.status}`;
  } catch {
    return `Backend returned ${res.status}`;
  }
}

export async function fetchProposals(sessionId: string): Promise<DateProposal[]> {
  const res = await fetch(`${API_BASE}/availability/session/${sessionId}/proposals`);
  if (!res.ok) return [];
  return res.json();
}

export async function confirmDay(token: string, dayNumber: number): Promise<boolean> {
  const res = await fetch(`${API_BASE}/availability/${token}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day_number: dayNumber }),
  });
  return res.ok;
}

export async function fetchConfirmations(sessionId: string): Promise<Confirmation[]> {
  const res = await fetch(`${API_BASE}/availability/session/${sessionId}/confirmations`);
  if (!res.ok) return [];
  return res.json();
}

// --- Chat command center (plain REST, not ADK — see backend/common/chat_routes.py) ---

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatResult {
  reply: string;
  actions: ChatAction[];
}

export async function sendChatMessage(
  message: string,
  history: ChatTurn[],
  projectContext: Record<string, unknown>
): Promise<ChatResult> {
  let res: Response;
  try {
    // Not "/chat" — that path collides with common ad/privacy-blocker
    // filter lists and gets silently dropped by the browser (opaque
    // "Failed to fetch", no CORS error, no obvious cause). See
    // backend/common/chat_routes.py.
    res = await fetch(`${API_BASE}/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, project: projectContext }),
    });
  } catch (e) {
    return { reply: `Could not reach the backend — is it running? (${e})`, actions: [] };
  }
  if (!res.ok) {
    return { reply: `Backend returned ${res.status}`, actions: [] };
  }
  return res.json();
}

// --- Durable Project/AppSettings persistence (see backend/common/project_store.py) ---
//
// Fixes VantageTime's biggest reliability gap: projects used to live
// only in one browser's localStorage, with no backup and nothing to
// fall back on if that storage was ever cleared or hit its quota.
// localStorage (lib/storage.ts) still exists as a fast local cache for
// instant paint on load, but these calls are now the source of truth —
// every real save reaches the backend, not just the browser.
//
// Deliberately best-effort at this layer: every function here either
// throws or returns null/[] on failure rather than crashing the caller,
// because a backend hiccup should never lose in-progress work the user
// can still see and keep editing locally — see page.tsx for how the
// fallback to local-only operation is handled.

export async function fetchProjectsRemote(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

/** Upserts one project. Deliberately takes a plain object, not a strict
 * Project — callers that are just keeping the backend in sync (as
 * opposed to the one-time full save right after a fresh upload) pass a
 * version with sourceDocument's dataUrl stripped out, to avoid resending
 * a multi-hundred-KB PDF on every unrelated save; see
 * project_store.py's `_preserve_source_document` for the backend half
 * of that — it keeps whatever's already stored when the incoming
 * payload doesn't include a dataUrl. */
export async function upsertProjectRemote<T extends { id: string }>(project: T): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${project.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
}

export async function deleteProjectRemote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
}

export async function fetchSettingsRemote(): Promise<AppSettings | null> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  const data = await res.json();
  return Object.keys(data).length > 0 ? data : null;
}

export async function putSettingsRemote(settings: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
}

export { API_BASE };
