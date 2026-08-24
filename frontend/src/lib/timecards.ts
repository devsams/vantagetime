import { PayBasis, PayRate, TimeCard } from "./types";

/** Standard entertainment-industry defaults — a day rate on an indie
 * set conventionally covers the same 10-hour day this app already
 * assumes everywhere else (see backend/common/tools.py's
 * _DEFAULT_SHOOT_HOURS), with time-and-a-half past 10h and double time
 * past 12h; hourly crew defaults to the more familiar 8/12 split.
 * Editable per person — never auto-applied without the filmmaker
 * having actually set a rate first. */
export function emptyPayRate(basis: PayBasis = "day"): PayRate {
  return basis === "day"
    ? { basis: "day", rate: 0, standardHours: 10, otThresholdHours: 12, otMultiplier: 1.5, doubleOtMultiplier: 2 }
    : { basis: "hourly", rate: 0, standardHours: 8, otThresholdHours: 12, otMultiplier: 1.5, doubleOtMultiplier: 2 };
}

export function emptyTimeCard(dayNumber: number, personName: string, personType: "Cast" | "Crew"): TimeCard {
  return {
    id: crypto.randomUUID(),
    dayNumber,
    personName,
    personType,
    callTime: "",
    wrapTime: "",
    mealBreakMinutes: 30,
    notes: "",
    status: "pending",
    updatedAt: Date.now(),
  };
}

/** Real clock-time arithmetic — "HH:MM" 24h in, hours worked out. A
 * wrap time earlier than call time is treated as having crossed
 * midnight (the normal case for a night shoot), never an error. */
export function computeHoursWorked(callTime: string, wrapTime: string, mealBreakMinutes: number): number {
  if (!callTime || !wrapTime) return 0;
  const [ch, cm] = callTime.split(":").map(Number);
  const [wh, wm] = wrapTime.split(":").map(Number);
  if ([ch, cm, wh, wm].some((n) => !Number.isFinite(n))) return 0;
  const callMinutes = ch * 60 + cm;
  let wrapMinutes = wh * 60 + wm;
  if (wrapMinutes <= callMinutes) wrapMinutes += 24 * 60;
  const worked = wrapMinutes - callMinutes - (mealBreakMinutes || 0);
  return Math.max(0, Math.round((worked / 60) * 100) / 100);
}

export interface PayBreakdown {
  hoursWorked: number;
  regularHours: number;
  otHours: number;
  doubleOtHours: number;
  regularPay: number;
  otPay: number;
  doubleOtPay: number;
  totalPay: number;
}

const EMPTY_PAY: Omit<PayBreakdown, "hoursWorked"> = {
  regularHours: 0,
  otHours: 0,
  doubleOtHours: 0,
  regularPay: 0,
  otPay: 0,
  doubleOtPay: 0,
  totalPay: 0,
};

/** Real arithmetic against hours actually logged and the rate the
 * filmmaker actually entered — never estimated, and $0 (not a guess)
 * for anyone with no rate on file yet. Day-rate people are paid the
 * flat rate for the day (that's what a day rate means) plus overtime
 * past standardHours/otThresholdHours, computed off an hourly
 * equivalent of their day rate (rate ÷ standardHours); hourly people
 * are paid straight hourly with the same OT/double-OT split. */
export function computePay(hoursWorked: number, rate: PayRate | undefined): PayBreakdown {
  if (!rate || hoursWorked <= 0 || rate.rate <= 0) {
    return { hoursWorked, ...EMPTY_PAY };
  }
  const standard = Math.max(0.01, rate.standardHours || 8);
  const otThreshold = Math.max(standard, rate.otThresholdHours || standard);
  const regularHours = Math.min(hoursWorked, standard);
  const otHours = Math.max(0, Math.min(hoursWorked, otThreshold) - standard);
  const doubleOtHours = Math.max(0, hoursWorked - otThreshold);

  const hourlyEquivalent = rate.basis === "day" ? rate.rate / standard : rate.rate;
  const regularPay = rate.basis === "day" ? rate.rate : regularHours * hourlyEquivalent;
  const otPay = otHours * hourlyEquivalent * (rate.otMultiplier || 1.5);
  const doubleOtPay = doubleOtHours * hourlyEquivalent * (rate.doubleOtMultiplier || 2);
  const totalPay = Math.round((regularPay + otPay + doubleOtPay) * 100) / 100;

  return {
    hoursWorked,
    regularHours: Math.round(regularHours * 100) / 100,
    otHours: Math.round(otHours * 100) / 100,
    doubleOtHours: Math.round(doubleOtHours * 100) / 100,
    regularPay: Math.round(regularPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    doubleOtPay: Math.round(doubleOtPay * 100) / 100,
    totalPay,
  };
}

export function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** CSV export — the "hand this to a payroll provider" step. One row
 * per time card, with the exact same numbers shown on screen. */
export function buildTimeCardsCsv(
  timeCards: TimeCard[],
  payRates: Record<string, PayRate>,
  shootDayDates: Record<number, string>
): string {
  const header = [
    "Day",
    "Date",
    "Name",
    "Type",
    "Call Time",
    "Wrap Time",
    "Meal Break (min)",
    "Hours Worked",
    "Regular Hrs",
    "OT Hrs",
    "2x OT Hrs",
    "Rate Basis",
    "Rate",
    "Regular Pay",
    "OT Pay",
    "2x OT Pay",
    "Total Pay",
    "Status",
  ];
  const rows = [...timeCards]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.personName.localeCompare(b.personName))
    .map((tc) => {
      const rate = payRates[tc.personName];
      const hours = computeHoursWorked(tc.callTime, tc.wrapTime, tc.mealBreakMinutes);
      const pay = computePay(hours, rate);
      return [
        tc.dayNumber,
        shootDayDates[tc.dayNumber] || "",
        tc.personName,
        tc.personType,
        tc.callTime,
        tc.wrapTime,
        tc.mealBreakMinutes,
        pay.hoursWorked,
        pay.regularHours,
        pay.otHours,
        pay.doubleOtHours,
        rate?.basis || "",
        rate?.rate ?? "",
        pay.regularPay,
        pay.otPay,
        pay.doubleOtPay,
        pay.totalPay,
        tc.status,
      ]
        .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : String(v)))
        .join(",");
    });
  return [header.join(","), ...rows].join("\n");
}

export function downloadTimeCardsCsv(projectName: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-time-cards.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
