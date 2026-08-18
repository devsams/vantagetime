import type {
  ActorView,
  Breakdown,
  Cancellation,
  CallSheets,
  CastOutreach,
  Confirmation,
  DateProposal,
  FeedStep,
  LocationResearch,
  OutreachScheduledDay,
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

const createdSessions = new Set<string>();

async function ensureSession(sessionId: string) {
  if (createdSessions.has(sessionId)) return;
  createdSessions.add(sessionId);
  try {
    await fetch(`${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`, {
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
  await ensureSession(sessionId);

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

// --- Actor availability magic-link flow (plain REST, not ADK) ---

export async function registerAvailabilityLinks(
  sessionId: string,
  projectName: string,
  actors: { name: string; scheduled_days: OutreachScheduledDay[] }[],
  proposedPeriod?: ProposedPeriod | null
): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/availability/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      project_name: projectName,
      actors,
      proposed_period: proposedPeriod ?? null,
    }),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  const items: { name: string; token: string }[] = await res.json();
  return Object.fromEntries(items.map((i) => [i.name, i.token]));
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

export { API_BASE };
