import connectDB from "@/lib/db";
import DailyClosing from "@/models/DailyClosing";
import Expense from "@/models/Expense";
import Payment from "@/models/Payment";
import Settings from "@/models/Settings";
import { AppError } from "@/lib/auth-helpers";
import { createWithAudit, updateWithAudit } from "@/lib/audit";
import { dayKey, dayRange, noonOfKey, todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

// Server-only. Daily cash closing.
//   cash in   = Payments with method cash (voided ones never count)
//   cash out  = APPROVED Expenses with method cash (pending/rejected don't count)
//   expected  = opening + in - out
// Bank / JazzCash / EasyPaisa are tracked separately: they are not in the cash drawer.
// Closing a day locks it (managers can no longer add/edit/void entries on it; see audit.js).

export const NON_CASH = ["bank", "jazzcash", "easypaisa"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two "yyyy-MM-dd" keys (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Every day key from `from` to `to`, inclusive. */
export function eachDay(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const byMethod = (rows) => Object.fromEntries(rows.map((r) => [r._id, { total: r.total, n: r.n }]));

/** Money in/out for one Karachi day, split by payment method. */
export async function dayFigures(dateKey) {
  const { start, end } = dayRange(dateKey);
  const range = { $gte: start, $lt: end };
  const group = { $group: { _id: "$method", total: { $sum: "$amount" }, n: { $sum: 1 } } };
  const [pay, exp, pending] = await Promise.all([
    Payment.aggregate([{ $match: { date: range } }, group]), // voided payments are left out by default
    Expense.aggregate([{ $match: { date: range, status: "approved" } }, group]),
    Expense.aggregate([
      { $match: { date: range, status: "pending_approval", method: "cash" } },
      { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } },
    ]),
  ]);
  const inn = byMethod(pay);
  const out = byMethod(exp);
  const other = Object.fromEntries(NON_CASH.map((m) => [m, { in: inn[m]?.total ?? 0, out: out[m]?.total ?? 0 }]));
  return {
    cashIn: inn.cash?.total ?? 0,
    cashOut: out.cash?.total ?? 0,
    other,
    pendingCashOut: pending[0]?.total ?? 0,
    pendingCashCount: pending[0]?.n ?? 0,
  };
}

/** Net cash movement (in - out) over [start, end). */
export async function cashNet(start, end) {
  if (!(start < end)) return 0;
  const range = { $gte: start, $lt: end };
  const [i, o] = await Promise.all([
    Payment.aggregate([{ $match: { date: range, method: "cash" } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { date: range, method: "cash", status: "approved" } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
  ]);
  return (i[0]?.t ?? 0) - (o[0]?.t ?? 0);
}

/**
 * Opening cash for a day = the counted cash of the latest CLOSED day before it, plus the net cash
 * movement of any days in between that were never closed (so cash from a skipped day isn't lost).
 * With no earlier closed day it is the first closing: { kind: "first", value } where value is
 * Settings.openingCashBalance (the owner sets it in Settings, and can still override it on the first closing form).
 */
export async function openingFor(dateKey) {
  const { start } = dayRange(dateKey);
  const prev = await DailyClosing.findOne({ date: { $lt: start }, isLocked: true }).sort({ date: -1 }).lean();
  if (!prev) {
    const settings = await Settings.getSingleton();
    return { kind: "first", value: settings.openingCashBalance ?? 0 };
  }
  const prevKey = dayKey(prev.date);
  const moved = await cashNet(dayRange(prevKey).end, start);
  return {
    kind: "previous",
    value: prev.actualCounted + moved,
    counted: prev.actualCounted,
    prevKey,
    moved,
    gapDays: Math.max(0, daysBetween(prevKey, dateKey) - 1),
  };
}

/** The closing record of a day (any state) or null. */
export async function closingOn(dateKey) {
  const { start, end } = dayRange(dateKey);
  return DailyClosing.findOne({ date: { $gte: start, $lt: end } });
}

/**
 * Close a day. All figures are recomputed here from the database; `expectedSeen` (what the user saw
 * on screen) is only used to refuse the close if the figures changed in the meantime.
 */
export async function closeDay({ dateKey, actualCounted, note = "", expectedSeen, openingOverride }, user) {
  await connectDB();
  if (dateKey > todayKarachi()) throw new AppError("A future day can't be closed", 400);

  const existing = await closingOn(dateKey);
  if (existing?.isLocked) throw new AppError("This day is already closed", 409);

  const opening = await openingFor(dateKey);
  let openingBalance = opening.value;
  // Only the very first closing has an editable opening balance, and only the owner may set it.
  if (opening.kind === "first" && openingOverride !== undefined && openingOverride !== null) {
    if (user.role !== "admin") throw new AppError("Only the owner can set the opening cash for the first closing", 403);
    openingBalance = openingOverride;
  }

  const fig = await dayFigures(dateKey);
  const expected = openingBalance + fig.cashIn - fig.cashOut;
  if (expectedSeen !== undefined && expectedSeen !== expected) {
    throw new AppError(
      `The figures changed while you were counting (expected cash is now ${formatPKR(expected)}). Please review the updated numbers and close again.`,
      409
    );
  }
  const difference = actualCounted - expected;
  const cleanNote = String(note || "").trim();
  if (difference !== 0 && !cleanNote) {
    throw new AppError("The counted cash doesn't match the expected cash. Write a note explaining the difference.", 400);
  }

  const data = {
    openingBalance,
    totalIn: fig.cashIn,
    totalOut: fig.cashOut,
    actualCounted,
    note: cleanNote || undefined,
    closedBy: user.id,
    isLocked: true,
  };
  if (existing) return updateWithAudit(DailyClosing, existing.id, { ...data, note: cleanNote }, user); // a reopened day, closed again
  return createWithAudit(DailyClosing, { date: noonOfKey(dateKey), ...data }, user);
}

/** Owner only: reopen a closed day. The reason is stored on the record and in the audit log. */
export async function unlockDay(closingId, reason, user) {
  await connectDB();
  if (user.role !== "admin") throw new AppError("Only the owner can unlock a day", 403);
  const why = String(reason || "").trim();
  if (why.length < 5) throw new AppError("A reason of at least 5 characters is required to unlock a day", 400);
  const doc = await DailyClosing.findById(closingId);
  if (!doc) throw new AppError("Closing not found", 404);
  if (!doc.isLocked) throw new AppError("This day is already unlocked", 409);
  return updateWithAudit(DailyClosing, closingId, { isLocked: false, unlockReason: why, unlockedBy: user.id, unlockedAt: new Date() }, user);
}
