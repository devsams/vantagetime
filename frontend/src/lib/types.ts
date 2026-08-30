// Trimmed from seven tabs down to four for a simpler top-level nav:
// "Scheduling" and "Validator" are now folded into "Production Plan" (a
// scheduling sub-tab, with validator pass/fail as an inline badge, not a
// separate click-through — internal StageKey stays "dates", only the
// display label changed, since it also covers location research and
// roster availability now, not just calendar dates). "Status" is folded
// into "Dashboard" (the former
// "Availability" tab, renamed — it already covered response tracking in
// its Roster Detail table; the old Status tab's compact per-person
// banner now lives there too). "Call Sheet" is the default tab a
// project opens to, since it's the document people actually use day to
// day; "Breakdown" is demoted to a reference tab.
export type StageKey =
  | "autopilot"
  | "breakdown"
  | "members"
  | "dates"
  | "callSheet"
  | "tasks"
  | "payroll"
  | "dashboard";

export const STAGE_LABELS: Record<StageKey, string> = {
  autopilot: "Autopilot",
  breakdown: "Breakdown",
  members: "Members",
  dates: "Production Plan",
  callSheet: "Call Sheet",
  tasks: "Task Master",
  payroll: "Time Cards",
  dashboard: "Dashboard",
};

export const STAGE_ORDER: StageKey[] = [
  "autopilot",
  "breakdown",
  "members",
  "dates",
  "callSheet",
  "tasks",
  "payroll",
  "dashboard",
];

// A project's place in the dashboard, set by hand rather than inferred —
// "shooting" isn't something the data can reliably detect (a validated
// schedule doesn't mean cameras are actually rolling today), so the
// filmmaker marks it themselves. Replaces the old plain archived boolean.
export type ProjectStatus = "live" | "inProgress" | "archived";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  live: "Live",
  inProgress: "In Progress",
  archived: "Archive",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["live", "inProgress", "archived"];

// --- Task Master (real assignable work items — cast, crew, or anyone
// on the roster — replaces the old free-text "Additional day notes" on
// the Call Sheet, which had no assignee/status/priority of its own). ---

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string; // must be a real cast or crew name, or "" (unassigned)
  assigneeType: "Cast" | "Crew" | "";
  status: TaskStatus;
  dueDate: string; // "YYYY-MM-DD" or ""
  location: string;
  priority: TaskPriority;
  dayNumber: number | null; // optional tie-in to a specific shoot day
  createdAt: number;
  updatedAt: number;
}

// --- Time Cards / Payroll (frontend-only — computes real cost from
// real logged hours and each person's own entered rate; never invents
// or estimates a rate nobody entered). One PayRate per person, one
// TimeCard per person per shoot day. ---

export type PayBasis = "day" | "hourly";

export interface PayRate {
  basis: PayBasis;
  rate: number; // dollars/day if basis is "day", dollars/hour if "hourly"
  // Overtime rules — standard entertainment-industry defaults (8hr/12hr
  // for hourly, 10hr/12hr for a day player, since a "day rate" on an
  // indie set conventionally already covers the app's own standard
  // 10-hour shoot day — see backend/common/tools.py's _DEFAULT_SHOOT_HOURS)
  // — but editable per person, since real agreements vary. Never
  // auto-applied without the filmmaker having set a rate first.
  standardHours: number; // hours included before overtime starts
  otThresholdHours: number; // hours before double-time starts
  otMultiplier: number; // e.g. 1.5
  doubleOtMultiplier: number; // e.g. 2
}

export type TimeCardStatus = "pending" | "approved";

export interface TimeCard {
  id: string;
  dayNumber: number;
  personName: string;
  personType: "Cast" | "Crew";
  callTime: string; // "HH:MM", 24h
  wrapTime: string; // "HH:MM", 24h — earlier than callTime means it crossed midnight
  mealBreakMinutes: number;
  notes: string;
  status: TimeCardStatus;
  updatedAt: number;
}

// --- Shoot-date window (priority-ladder candidate-block picking) ---

export interface DateWindow {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
  blackout_dates: string[];
  num_shoot_days: number;
  candidate_blocks: string[][]; // up to 3 real N-day options, computed backend-side
  locked_block: string[] | null;
  error: string;
}

// --- Backend pipeline output shapes (must match backend/common/instructions.py schemas) ---

export interface Scene {
  number: number;
  slugline: string;
  int_ext: string;
  time_of_day: string;
  location: string;
  synopsis: string;
  characters: string[];
  props: string[];
  page_count: number;
  flags: string[];
}

export interface CastMember {
  name: string;
  scene_count: number;
  role_size: string;
}

export interface LocationEntry {
  name: string;
  scene_count: number;
  int_ext: string;
}

export interface PropEntry {
  name: string;
  scene_count: number;
  scenes: number[];
}

export interface Breakdown {
  project_name: string;
  logline: string;
  format: string;
  page_count: number;
  scene_count: number;
  estimated_runtime_minutes: number;
  scenes: Scene[];
  cast: CastMember[];
  locations: LocationEntry[];
  props: PropEntry[];
  production_flags: string[];
  notes_for_scheduling: string;
  updated_this_turn: string;
}

export interface ValidatorIssue {
  severity: "error" | "warning";
  day_number: number | null;
  message: string;
}

export interface CastHours {
  name: string;
  hours_needed: number;
}

export interface ShootDay {
  day_number: number;
  scenes: number[];
  locations: string[];
  total_pages: number;
  call_time_note: string;
  date: string; // "YYYY-MM-DD", empty if no shoot window has been set
  weather_flag: string; // empty if none
  sunrise: string; // "HH:MM" local time, real data from get_weather — empty if none
  sunset: string; // "HH:MM" local time, real data from get_weather — empty if none
  cast_hours: CastHours[];
}

export interface ScheduleAttemptDay {
  day_number: number;
  scenes: number[];
  locations: string[];
  total_pages: number;
}

export interface ScheduleAttempt {
  shoot_days: ScheduleAttemptDay[];
  issues: ValidatorIssue[];
}

export interface Schedule {
  shoot_days: ShootDay[];
  valid: boolean;
  validator_issues: ValidatorIssue[];
  first_attempt: ScheduleAttempt | null;
  calendar_error: string;
  updated_this_turn: string;
}

export interface SourceRef {
  title: string;
  url: string;
}

export interface LocationResearch {
  assigned: boolean;
  location_name: string | null;
  research_blocked: boolean;
  permit_notes: string;
  weather_notes: string;
  hours_notes: string; // real operating hours / days closed for a public location — empty if private property, blocked, or not found (never guessed)
  logistics_notes: string;
  nearest_hospital: string; // name/address/phone, real search result — empty if not found or blocked
  emergency_contacts: string; // local police/fire non-emergency numbers, real search result — empty if not found or blocked
  sources: SourceRef[];
  updated_this_turn: string;
}

export interface CallSheetScene {
  number: number;
  slugline: string;
  synopsis: string;
  cast: string[];
  page_count: number;
}

export interface CallSheetLocation {
  name: string;
  permit_notes: string;
  weather_notes: string;
  hours_notes: string;
  logistics_notes: string;
  nearest_hospital: string;
  emergency_contacts: string;
  sources: SourceRef[];
}

export interface CastCallTime {
  name: string;
  role_size: string;
  hours_needed: number;
  note: string;
}

export interface CallSheetDay {
  day_number: number;
  scenes: CallSheetScene[];
  location: CallSheetLocation;
  date: string; // "YYYY-MM-DD", copied from schedule — empty if unset
  weather_flag: string;
  sunrise: string; // "HH:MM"
  sunset: string; // "HH:MM"
  call_time_note: string;
  cast_call_times: CastCallTime[];
  production_flags: string[];
  safety_notes: string;
  validator_notes: string[];
}

export interface CallSheets {
  call_sheets: CallSheetDay[];
  unresolved: string[];
  updated_this_turn: string;
}

export interface OutreachScheduledDay {
  day_number: number;
  locations: string[];
  date: string; // "YYYY-MM-DD", empty if no shoot window has been set
  hours_needed: number;
}

export interface CastOutreachEntry {
  name: string;
  role_size: string;
  scheduled_days: OutreachScheduledDay[];
  email_subject: string;
  email_body: string;
}

export interface CastOutreach {
  cast_outreach: CastOutreachEntry[];
  updated_this_turn: string;
}

// --- Actor availability magic-link flow (plain REST, not part of the agent pipeline) ---

export interface Cancellation {
  actor_name: string;
  day_number: number;
  cancelled_at: number;
}

export interface DateProposal {
  actor_name: string;
  day_number: number;
  dates: string[]; // "YYYY-MM-DD", at least 3 distinct dates
  submitted_at: number;
}

export interface Confirmation {
  actor_name: string;
  day_number: number;
  confirmed_at: number;
}

export interface ActorViewDay {
  day_number: number;
  locations: string[];
  date: string; // "YYYY-MM-DD", empty if no shoot window has been set yet
  hours_needed: number;
  cancelled: boolean;
  confirmed: boolean;
  proposed_dates: string[];
}

export interface ProposedPeriod {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
}

// Present only once the filmmaker has set a shoot-date window (Dates
// tab). Reflects this specific actor's place in the combined
// cast/crew/other priority ladder — never guessed, computed backend-side
// from the same priority flag the filmmaker already set on this person.
export interface ActorViewWindow {
  num_shoot_days: number;
  locked_block: string[] | null; // real "YYYY-MM-DD" dates once locked, else null
  can_pick: boolean; // true only for the single highest-priority person, before anyone has locked
  waiting_on_higher_priority: boolean;
  candidate_blocks: string[][]; // up to 3 options, only populated when can_pick is true
}

export interface ActorView {
  project_name: string;
  actor_name: string;
  proposed_period: ProposedPeriod | null;
  session_id: string;
  window: ActorViewWindow | null;
  days: ActorViewDay[];
}

// --- Calendar sync roster (frontend-only, not part of the agent pipeline) ---

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  email: string;
  priority: boolean;
  // Free text carried over from a spreadsheet import (see roster
  // import) — crew has no real AvailabilityConstraint field the way
  // locations/"Other" items do, so a stated availability window from a
  // spreadsheet is kept here as a visible note rather than silently
  // dropped. Never enforced — the real signal is still whatever this
  // person confirms/proposes through their own magic link.
  availabilityNote?: string;
}

// --- Availability constraints (frontend-only; enforced by real date
// arithmetic in lib/locationAvailability.ts, not by the agent). Shared
// shape between locations and "Other" roster items (rental gear,
// vehicles, any outside vendor with its own availability window) so
// both get the same days/window/preferred-dates/time/priority editor. ---

export interface AvailabilityConstraint {
  daysOfWeek: number[]; // 0=Sun..6=Sat (Date.getUTCDay() convention); empty = no day-of-week restriction
  windowStart: string; // "YYYY-MM-DD", empty = no restriction
  windowEnd: string; // "YYYY-MM-DD", empty = no restriction
  preferredDates: string[]; // "YYYY-MM-DD"[] — soft preference, not a hard restriction
  timeStart: string; // "HH:MM", empty = no restriction — informational only (shoot days don't carry a call time)
  timeEnd: string; // "HH:MM", empty = no restriction — informational only
  notes: string; // free text, e.g. "owner only lets us in weekday mornings" — informational only, not enforced
  priority: boolean; // filmmaker-flagged as locked/critical — surfaced first in Conflicts
}

export interface LocationAvailability extends AvailabilityConstraint {
  location: string;
  address: string; // street address / GPS coordinates / cross streets — filmmaker-entered, shown on the call sheet
  mapsUrl: string; // Google Maps link — filmmaker-entered, shown on the call sheet as a direct "open in Maps" link
  contactName: string; // property owner / location manager — filmmaker-entered, shown on the call sheet
  contactPhone: string;
  contactEmail: string;
  // Explicit sign-off from the production team: "we've checked this
  // location's real availability (or confirmed it has no restrictions)."
  // Gates cast/crew/other outreach — see stageDone/locationsReady in
  // DatesSection — so a location can't silently get skipped before
  // people start getting emailed real (possibly wrong) dates.
  reviewed: boolean;
}

// One-way owner notification, not a magic-link response flow — see
// Autopilot / lib/locationOutreach.ts.
export interface LocationOutreachStatus {
  sent: boolean;
  sentAt: number | null;
  lastError?: string;
}

// A rented/borrowed item, vehicle, or outside vendor — anything with its
// own name, a contact email, and an availability window, tracked the
// same way a location is. Manually added/removed like crew (not
// auto-derived from the script breakdown).
export interface OtherItem extends AvailabilityConstraint {
  id: string;
  name: string;
  email: string;
}

// --- Call sheet fields with no source of truth in the agent pipeline —
// production-specific human decisions (who's the UPM, which walkie
// channel is camera on) that only the filmmaker can supply. Entered
// once (ProductionInfo, applies to every day) or per shoot day
// (CallSheetDayExtras), never generated by an LLM. ---

export interface ProductionInfo {
  companyName: string; // producing entity's legal business name
  upmName: string;
  upmPhone: string;
  firstAdName: string;
  firstAdPhone: string;
  secondAdName: string;
  secondAdPhone: string;
  crewCallPhone: string;
  safetyOfficerName: string;
  safetyOfficerPhone: string;
  safetyHotline: string; // dedicated (often anonymous) unsafe-conditions line
  medicName: string;
  medicPhone: string;
  medicLocation: string; // where the on-set medic station is
  walkieChannels: string; // free text, e.g. "Ch1: AD, Ch2: Camera, Ch3: G&E"
}

export interface CallSheetDayExtras {
  advanceSchedule: string; // tomorrow's scenes/sets/cast, for overnight prep
  specialEquipment: string; // e.g. "Steadicam required", "SFX explosion scene 4"
  parkingShuttle: string; // on/off-site parking + shuttle run times
  companyMove: string; // timeline/directions if moving locations mid-day
  backgroundExtras: string; // headcount, arrival time, holding area, wardrobe
  castTransport: string; // pick-up/transport times from hotel/residence
  standInsStunts: string; // stand-in and stunt-double arrival/wardrobe/assignments
  minorRules: string; // child-labor compliance, tutor hours, legal max hours
  customFields: CallSheetCustomField[]; // filmmaker-added question/answer pairs, unlimited
}

// A freeform question/answer pair the filmmaker adds to a specific day's
// call sheet — for anything not covered by the fixed fields above.
export interface CallSheetCustomField {
  id: string;
  question: string;
  answer: string;
}

// --- Frontend project state ---

export interface FeedStep {
  agent: string;
  text: string;
}

export interface Project {
  id: string;
  name: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number | null;
  // How this project got its first data — a script upload (the full
  // breakdown -> schedule -> call sheet pipeline applies) or an
  // imported roster spreadsheet (no scenes, so those stages start
  // empty and the project goes straight to Dates/Roster). Absent on
  // projects created before this existed, which were always scripts.
  startedFrom?: "script" | "roster";
  // The file originally uploaded to create this project (script PDF, or
  // roster CSV/PDF), kept so the filmmaker can open/download it later to
  // cross-check against what got extracted. Null if none was kept — no
  // file was uploaded (a follow-up-only project), or it was over the
  // size cap and skipped to protect localStorage's quota.
  sourceDocument: { name: string; mimeType: string; dataUrl: string } | null;
  breakdown: Breakdown | null;
  schedule: Schedule | null;
  locationResearch: Record<number, LocationResearch>;
  callSheets: CallSheets | null;
  castOutreach: CastOutreach | null;
  availabilityLinks: Record<string, string>; // actor name -> token
  castEmails: Record<string, string>; // cast name -> email
  castPriority: Record<string, boolean>; // cast name -> priority flag
  // Same reasoning as CrewMember.availabilityNote — cast has no
  // AvailabilityConstraint field, so a spreadsheet-stated window is
  // surfaced here rather than dropped. Frontend-only, never enforced.
  castAvailabilityNote: Record<string, string>;
  crew: CrewMember[];
  proposedPeriod: ProposedPeriod | null;
  locationAvailability: Record<string, LocationAvailability>; // location name -> constraint
  otherItems: OtherItem[]; // rented gear, vehicles, outside vendors
  productionInfo: ProductionInfo; // filmmaker-entered, applies to every call sheet day
  callSheetExtras: Record<number, CallSheetDayExtras>; // day_number -> filmmaker-entered day fields
  feed: FeedStep[];
  // The floating Command Center chat's history for this project only —
  // a chat opened on one project never shows another project's messages.
  // Capped at the 4 most-recently-active threads (see ChatWidget.tsx);
  // older ones are dropped rather than growing localStorage forever.
  chatThreads: ChatThread[];
  // Real assignable work items — see Task Master.
  tasks: Task[];
  // Time Cards / Payroll — see lib/timecards.ts. Keyed by person name;
  // a person with no entry here has no rate set yet, so their time
  // cards show hours but no computed pay until one is entered.
  payRates: Record<string, PayRate>;
  timeCards: TimeCard[];
  // Per-location owner outreach status, keyed by location name — see
  // Autopilot. Separate from availabilityLinks (that's cast/crew/other,
  // which get a real magic-link and response tracking; a location owner
  // just gets a one-way notification email, no link, no response UI).
  locationOutreach: Record<string, LocationOutreachStatus>;
  // See ProjectStatus — set by the filmmaker, drives which dashboard tab
  // (Live / In Progress / Archive) a project shows up in.
  status: ProjectStatus;
}

// --- Global app settings (frontend-only, not tied to any single project) ---
// Separate from Project.productionInfo, which is per-project and shown on
// call sheets. This is the filmmaker's standing info — the production
// company's identity and the regular team they work with across
// productions — kept once instead of re-typed on every new project.

export interface CompanyProfile {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

// A recurring collaborator — the UPM, DP, sound person, etc. you work with
// across productions. Freeform role since indie crews don't fit fixed
// titles. Not linked to any project's cast/crew roster (Members tab) —
// this is a reference directory, not enforced or auto-applied anywhere.
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface AppSettings {
  companyProfile: CompanyProfile;
  team: TeamMember[];
}

// --- Command Center chat (frontend-only; see backend/common/chat_routes.py) ---

export interface ChatAction {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  actions?: ChatAction[];
}

export interface ChatThread {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
