import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/** A real date (Date object or an ISO string from an audit snapshot). Anything else in a date column is a label like "Total". */
export const isDateLike = (v) => v instanceof Date || (typeof v === "string" && ISO.test(v));

// Turns a report cell/summary value into display text. Shared by the web page and the PDF.
export function formatValue(value, type) {
  if (value === null || value === undefined || value === "") return "";
  if ((type === "date" || type === "datetime") && !isDateLike(value)) return String(value);
  switch (type) {
    case "money":
      return formatPKR(value);
    case "int":
      return Number(value).toLocaleString("en-US");
    case "pct":
      return `${Math.round(value * 100)}%`;
    case "date":
      return formatDate(new Date(value));
    case "datetime":
      return formatDateTime(new Date(value));
    default:
      return String(value);
  }
}

/** "in" green, "out" red, "auto" by sign, anything else neutral. */
export function toneOf(tone, value) {
  if (tone === "in") return "in";
  if (tone === "out") return "out";
  if (tone === "auto") return value > 0 ? "in" : value < 0 ? "out" : "neutral";
  return "neutral";
}
