import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, dayKey, startOfDayKarachi, todayKarachi } from "@/lib/dates";

// Salary maths and month helpers. Pure (client- and server-safe).
// A "month" is the string "YYYY-MM" (Asia/Karachi).

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const currentMonth = () => todayKarachi().slice(0, 7);

export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) of a month in Karachi time. */
export function monthRange(month) {
  return { start: startOfDayKarachi(`${month}-01`), end: startOfDayKarachi(`${addMonths(month, 1)}-01`) };
}

export function monthLabel(month) {
  return formatInTimeZone(startOfDayKarachi(`${month}-01`), TIMEZONE, "MMMM yyyy");
}

/** The last `n` months, newest first: [{ value: "2026-11", label: "November 2026" }, ...] */
export function recentMonths(n = 12) {
  const now = currentMonth();
  return Array.from({ length: n }, (_, i) => {
    const value = addMonths(now, -i);
    return { value, label: monthLabel(value) };
  });
}

/**
 * Gross salary for one month from attendance counts.
 *  - monthly: wage / days-in-month x days worked, where days worked = days in service that month
 *    minus absents minus half a day per half-day. Days with NO attendance mark count as worked
 *    (nobody was recorded absent).
 *  - daily:   wage x days worked, where days worked = present + 0.5 x half days. Unmarked days
 *    count as NOT worked (only recorded days are paid).
 * Days before the join date are not counted. Rounded to whole rupees.
 *
 * `joinKey`: "yyyy-MM-dd" (Karachi) or null. `counts`: { present, half, absent }.
 */
export function calcGross({ wageType, wageAmount, joinKey, month, counts }) {
  const dim = daysInMonth(month);
  const present = counts?.present || 0;
  const half = counts?.half || 0;
  const absent = counts?.absent || 0;

  if (joinKey && joinKey.slice(0, 7) > month) {
    return { gross: 0, daysWorked: 0, daysInMonth: dim, periodDays: 0, notJoined: true };
  }
  const startDay = joinKey && joinKey.slice(0, 7) === month ? Number(joinKey.slice(8, 10)) : 1;
  const periodDays = dim - (startDay - 1);

  if (wageType === "daily") {
    const daysWorked = present + half * 0.5;
    return { gross: Math.round(wageAmount * daysWorked), daysWorked, daysInMonth: dim, periodDays };
  }
  const daysWorked = Math.max(0, periodDays - absent - half * 0.5);
  return { gross: Math.round((wageAmount / dim) * daysWorked), daysWorked, daysInMonth: dim, periodDays };
}

/** Oldest-first allocation of `amount` across outstanding advances: [{ advance, amount }]. */
export function allocateAdvances(advances, amount) {
  let left = amount;
  const out = [];
  for (const a of advances) {
    if (left <= 0) break;
    const take = Math.min(left, a.outstanding);
    if (take > 0) out.push({ advance: a.id, amount: take });
    left -= take;
  }
  return { allocations: out, unallocated: left };
}

export { dayKey };
