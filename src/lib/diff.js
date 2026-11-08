import { formatDateTime } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

// Client-safe helpers for showing an audit entry's old vs new values.

// Fields that change on every save and would only be noise.
const IGNORED = new Set(["updatedAt", "__v"]);

// Integer rupee fields, shown as "Rs 12,500".
const MONEY = new Set([
  "amount", "totalAmount", "netAmount", "discount", "advanceReceived", "balance", "rate", "total",
  "paidAmount", "dueAmount", "openingBalance", "wageAmount", "grossAmount", "advanceDeducted",
  "bonus", "otherDeduction", "netPaid", "recoveredAmount", "totalIn", "totalOut",
  "expectedClosing", "actualCounted", "difference", "receiptRequiredAbove", "approvalRequiredAbove",
]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function formatValue(key, v) {
  if (v === undefined || v === null || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return MONEY.has(key) ? formatPKR(v) : String(v);
  if (typeof v === "string") return ISO.test(v) ? formatDateTime(new Date(v)) : v;
  return JSON.stringify(v); // arrays (items) and nested objects
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Changed fields between two snapshots.
 * Returns [{ key, hasOld, hasNew, old, new }] (already formatted as strings).
 * create: every new field. void/update: only fields whose value differs.
 */
export function diffValues(oldValue, newValue) {
  const o = oldValue && typeof oldValue === "object" ? oldValue : {};
  const n = newValue && typeof newValue === "object" ? newValue : {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !IGNORED.has(k));

  return keys
    .filter((k) => !same(o[k], n[k]))
    .map((k) => ({
      key: k,
      hasOld: k in o,
      hasNew: k in n,
      old: formatValue(k, o[k]),
      new: formatValue(k, n[k]),
    }));
}
