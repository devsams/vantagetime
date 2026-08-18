import { CallSheetDayExtras, CallSheetCustomField, ProductionInfo } from "./types";

// Fields with no source of truth in the agent pipeline — production
// decisions (who's the UPM, which channel is camera on) that only the
// filmmaker can supply. Defaults are all empty strings; nothing here
// is ever guessed or pre-filled.

export function emptyProductionInfo(): ProductionInfo {
  return {
    companyName: "",
    upmName: "",
    upmPhone: "",
    firstAdName: "",
    firstAdPhone: "",
    secondAdName: "",
    secondAdPhone: "",
    crewCallPhone: "",
    safetyOfficerName: "",
    safetyOfficerPhone: "",
    safetyHotline: "",
    medicName: "",
    medicPhone: "",
    medicLocation: "",
    walkieChannels: "",
  };
}

export function emptyCallSheetDayExtras(): CallSheetDayExtras {
  return {
    advanceSchedule: "",
    specialEquipment: "",
    parkingShuttle: "",
    companyMove: "",
    backgroundExtras: "",
    castTransport: "",
    standInsStunts: "",
    minorRules: "",
    customFields: [],
  };
}

export function newCallSheetCustomField(): CallSheetCustomField {
  return { id: crypto.randomUUID(), question: "", answer: "" };
}

export function isEmptyProductionInfo(p: ProductionInfo): boolean {
  return Object.values(p).every((v) => !v.trim());
}

export function isEmptyDayExtras(e: CallSheetDayExtras): boolean {
  const { customFields, ...fixedFields } = e;
  return (
    Object.values(fixedFields).every((v) => !v.trim()) &&
    customFields.every((f) => !f.question.trim() && !f.answer.trim())
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Formats a page count stored in screenplay eighths (e.g. 2.375) as the
 * conventional fractional notation script supervisors use (e.g. "2 3/8").
 * Pure display formatting of a number that's already real — never an
 * estimate itself. Rounds to the nearest eighth in case a value drifted
 * (e.g. from summed decimals) slightly off-grid. */
export function formatPageCount(pages: number): string {
  if (!Number.isFinite(pages)) return "0";
  const eighthsTotal = Math.round(pages * 8);
  const whole = Math.trunc(eighthsTotal / 8);
  const remainder = Math.abs(eighthsTotal % 8);
  if (remainder === 0) return `${whole}`;
  const divisor = gcd(remainder, 8);
  const num = remainder / divisor;
  const den = 8 / divisor;
  const fraction = `${num}/${den}`;
  if (whole === 0) return `${eighthsTotal < 0 ? "-" : ""}${fraction}`;
  return `${whole} ${fraction}`;
}
