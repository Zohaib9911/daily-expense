import { resolveDateRange } from "@/lib/date-range";

// Shared by every report builder. A REPORT is a plain object, rendered three ways (web page, Excel, PDF):
//
//   {
//     key, title, filename,                    // filename = "expense-report" (period is added on export)
//     range: { from, to, label },
//     summary: [{ label, value, kind, tone }], // kind: money | int | pct | text; tone: in | out | auto | neutral
//     tables: [{
//       id, title, note?,
//       columns: [{ key, label, type, tone?, w? }],   // type: text | money | int | pct | date | datetime
//       rows: [{ [key]: value, _href?: "/expenses/<id>" }],
//       totals?: { [key]: value },
//     }],
//     drill?: ...                              // optional extra for the web page only
//   }
//
// All amounts are whole rupees. Voided records are never included (the models' default guard).

/** Range for a report: the URL's DateFilter values, defaulting to "this month". */
export function reportRange(params = {}) {
  const get = (k) => (typeof params.get === "function" ? params.get(k) : Array.isArray(params[k]) ? params[k][0] : params[k]);
  return resolveDateRange({ range: get("range") || "month", from: get("from"), to: get("to") });
}

/** Mongo match for a date field inside the range. */
export const inRange = (r, field = "date") => ({ [field]: { $gte: r.start, $lt: r.end } });

/** "2026-10" for a whole/partial single month, "2026-11-04" for one day, otherwise "2026-10-01_to_2026-10-15". */
export function periodSlug(r) {
  if (r.from === r.to) return r.from;
  if (r.from.slice(0, 7) === r.to.slice(0, 7) && r.from.endsWith("-01")) return r.from.slice(0, 7);
  return `${r.from}_to_${r.to}`;
}

export const pct = (part, whole) => (whole > 0 ? part / whole : 0);
export const sumBy = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);

/** Row limit for the web page (exports always contain every row). */
export const WEB_ROW_LIMIT = 300;
