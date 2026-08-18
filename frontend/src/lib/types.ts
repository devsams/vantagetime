export type StageKey =
  | "breakdown"
  | "scheduling"
  | "validator"
  | "locations"
  | "callSheet"
  | "availability"
  | "planning"
  | "dates"
  | "status";

export const STAGE_LABELS: Record<StageKey, string> = {
  breakdown: "Breakdown",
  scheduling: "Scheduling",
  validator: "Validator",
  locations: "Locations",
  callSheet: "Call Sheet",
  availability: "Availability",
  planning: "Planning",
  dates: "Dates",
  status: "Status",
};

export const STAGE_ORDER: StageKey[] = [
  "breakdown",
  "scheduling",
  "validator",
  "locations",
  "callSheet",
  "status",
  "planning",
  "availability",
  "dates",
];

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

export interface ActorView {
  project_name: string;
  actor_name: string;
  proposed_period: ProposedPeriod | null;
  days: ActorViewDay[];
}

// --- Calendar sync roster (frontend-only, not part of the agent pipeline) ---

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  email: string;
  priority: boolean;
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
  contactName: string; // property owner / location manager — filmmaker-entered, shown on the call sheet
  contactPhone: string;
  contactEmail: string;
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
  breakdown: Breakdown | null;
  schedule: Schedule | null;
  locationResearch: Record<number, LocationResearch>;
  callSheets: CallSheets | null;
  castOutreach: CastOutreach | null;
  availabilityLinks: Record<string, string>; // actor name -> token
  castEmails: Record<string, string>; // cast name -> email
  castPriority: Record<string, boolean>; // cast name -> priority flag
  crew: CrewMember[];
  proposedPeriod: ProposedPeriod | null;
  locationAvailability: Record<string, LocationAvailability>; // location name -> constraint
  otherItems: OtherItem[]; // rented gear, vehicles, outside vendors
  productionInfo: ProductionInfo; // filmmaker-entered, applies to every call sheet day
  callSheetExtras: Record<number, CallSheetDayExtras>; // day_number -> filmmaker-entered day fields
  feed: FeedStep[];
}
