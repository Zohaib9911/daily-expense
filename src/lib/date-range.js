import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, dayRange, todayKarachi } from "@/lib/dates";

// Client-safe. Shared by <DateFilter /> (UI) and server pages (query).
//   const r = resolveDateRange(await searchParams);
//   Model.find({ date: { $gte: r.start, $lt: r.end } })

export const RANGES = ["today", "week", "month", "custom"];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const one = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * `params`: { range, from, to } (plain object or URLSearchParams).
 * Returns { range, from, to, start, end, label }: `from`/`to` are inclusive Karachi
 * "yyyy-MM-dd" keys; `start`/`end` are Dates for a [start, end) query.
 * Week starts on Monday. "This week/month" run up to today.
 */
export function resolveDateRange(params = {}) {
  const get = (k) => (typeof params.get === "function" ? params.get(k) : one(params[k]));
  const today = todayKarachi();
  let range = RANGES.includes(get("range")) ? get("range") : "today";
  let from = today;
  let to = today;

  if (range === "week") {
    const isoDow = Number(formatInTimeZone(new Date(), TIMEZONE, "i")); // 1 = Mon ... 7 = Sun
    from = addDays(today, -(isoDow - 1));
  } else if (range === "month") {
    from = `${today.slice(0, 8)}01`;
  } else if (range === "custom") {
    const f = get("from");
    const t = get("to");
    if (KEY_RE.test(f || "") && KEY_RE.test(t || "")) {
      from = f <= t ? f : t;
      to = f <= t ? t : f;
    } else {
      range = "today";
    }
  }

  const label =
    from === to
      ? formatInTimeZone(dayRange(from).start, TIMEZONE, "dd MMM yyyy")
      : `${formatInTimeZone(dayRange(from).start, TIMEZONE, "dd MMM")} – ${formatInTimeZone(dayRange(to).start, TIMEZONE, "dd MMM yyyy")}`;

  return { range, from, to, start: dayRange(from).start, end: dayRange(to).end, label };
}
