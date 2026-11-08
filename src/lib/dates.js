import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Single source of truth for "what day is it" (client-safe, no server imports).
// Relative import paths with ".js" are used by src/models so plain `node` scripts work too.

export const TIMEZONE = "Asia/Karachi";

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

/** Calendar day "yyyy-MM-dd" of a date, in Asia/Karachi. */
export function dayKey(date) {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

/** Today's "yyyy-MM-dd" in Asia/Karachi. */
export function todayKarachi() {
  return dayKey(new Date());
}

/** True when `date` falls on a Karachi day before today. Invalid/missing dates are not backdated. */
export function isBackdated(date) {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (!isValidDate(d)) return false;
  return dayKey(d) < todayKarachi();
}

/** Start (00:00 Karachi) of the day given as a Date or "yyyy-MM-dd". */
export function startOfDayKarachi(input) {
  const key = typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : dayKey(input);
  return fromZonedTime(`${key}T00:00:00`, TIMEZONE);
}

/** [start, end) of a Karachi day, for range queries. Pakistan has no DST, so a day is 24h. */
export function dayRange(input) {
  const start = startOfDayKarachi(input);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function formatDate(date) {
  return formatInTimeZone(date, TIMEZONE, "dd MMM yyyy");
}

export function formatDateTime(date) {
  return formatInTimeZone(date, TIMEZONE, "dd MMM yyyy, h:mm a");
}

const HOUR = 60 * 60 * 1000;

/**
 * "yyyy-MM-dd" -> the Date to store for an entry. Today = right now (keeps the real time);
 * any other day = noon Karachi on that day (so it can't slip into a neighbouring day).
 */
export function entryDateFromKey(key) {
  return key === todayKarachi() ? new Date() : noonOfKey(key);
}

/** Noon Karachi on "yyyy-MM-dd" (for date-only fields like a delivery date). */
export function noonOfKey(key) {
  return new Date(startOfDayKarachi(key).getTime() + 12 * HOUR);
}

/** Whole days from today (Karachi) to the given date: negative = in the past. */
export function daysFromToday(date) {
  const a = Date.parse(`${dayKey(date)}T00:00:00Z`);
  const b = Date.parse(`${todayKarachi()}T00:00:00Z`);
  return Math.round((a - b) / (24 * HOUR));
}
