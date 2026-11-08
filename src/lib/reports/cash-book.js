import DailyClosing from "@/models/DailyClosing";
import Expense from "@/models/Expense";
import Payment from "@/models/Payment";
import { cashNet, openingFor } from "@/lib/closing";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { dayKey, dayRange } from "@/lib/dates";
import { CATEGORY_META } from "@/lib/expense-meta";
import { inRange, sumBy } from "@/lib/reports/common";

/** Cash in the drawer at the start of the range (and how it was worked out). */
async function openingAt(r) {
  const o = await openingFor(r.from);
  if (o.kind === "previous") return { value: o.value, note: "Opening = counted cash of the last closed day before this range, plus cash movement on days that were never closed." };
  const first = await DailyClosing.findOne({ isLocked: true }).sort({ date: 1 }).lean();
  if (!first) return { value: o.value, note: "No day has been closed yet, so the running balance starts from the opening cash set in Settings." };
  const net = await cashNet(r.start, dayRange(dayKey(first.date)).start); // movement between the range start and the first closing's day
  return { value: first.openingBalance - net, note: "Opening worked back from the first closing's opening cash." };
}

// Cash book: every CASH payment received (in) and every APPROVED cash expense (out), oldest first, with the
// running balance. Same rules as the daily closing, so the figures agree with it.
export async function buildCashBook(r) {
  const [opening, payments, expenses, closings] = await Promise.all([
    openingAt(r),
    Payment.find({ ...inRange(r), method: "cash" }).populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } }).lean(),
    Expense.find({ ...inRange(r), method: "cash", status: "approved" }).lean(),
    DailyClosing.find({ ...inRange(r), isLocked: true }).sort({ date: 1 }).lean(),
  ]);

  const entries = [
    ...payments.map((p) => ({ at: p.date, created: p.createdAt, type: "Cash in", what: `${PAYMENT_TYPE_LABELS[p.type] || "Payment"}${p.order ? ` · ${p.order.orderNo} ${p.order.customerName}` : p.note ? ` · ${p.note}` : ""}`, inn: p.amount, out: 0, href: `/payments/${p._id}` })),
    ...expenses.map((e) => ({ at: e.date, created: e.createdAt, type: "Cash out", what: `${CATEGORY_META[e.category]?.label || e.category}${e.paidTo ? ` · ${e.paidTo}` : ""}`, inn: 0, out: e.amount, href: `/expenses/${e._id}` })),
  ].sort((a, b) => a.at - b.at || a.created - b.created);

  let balance = opening.value;
  const rows = entries.map((e) => {
    balance += e.inn - e.out;
    return { date: e.at, type: e.type, what: e.what, inn: e.inn || null, out: e.out || null, balance, _href: e.href };
  });
  const totalIn = sumBy(entries, "inn");
  const totalOut = sumBy(entries, "out");

  return {
    key: "cash-book",
    title: "Cash book",
    filename: "cash-book",
    range: r,
    summary: [
      { label: "Opening cash", value: opening.value, kind: "money" },
      { label: "Cash in", value: totalIn, kind: "money", tone: "in" },
      { label: "Cash out", value: totalOut, kind: "money", tone: "out" },
      { label: "Closing cash (calculated)", value: opening.value + totalIn - totalOut, kind: "money" },
    ],
    tables: [
      {
        id: "book",
        title: "Cash book",
        note: `Cash payments received and approved cash expenses only. ${opening.note}`,
        columns: [
          { key: "date", label: "Date", type: "datetime", link: true },
          { key: "type", label: "Type", type: "text" },
          { key: "what", label: "Details", type: "text", w: 5 },
          { key: "inn", label: "Cash in", type: "money", tone: "in" },
          { key: "out", label: "Cash out", type: "money", tone: "out" },
          { key: "balance", label: "Balance", type: "money" },
        ],
        rows: [{ date: null, type: "", what: "Opening balance", inn: null, out: null, balance: opening.value }, ...rows],
        totals: { what: "Totals", inn: totalIn, out: totalOut, balance: opening.value + totalIn - totalOut },
      },
      {
        id: "closings",
        title: "Daily closings in this period",
        note: "What was actually counted in the drawer on each closed day.",
        columns: [
          { key: "day", label: "Day", type: "date" },
          { key: "expected", label: "Expected", type: "money" },
          { key: "counted", label: "Counted", type: "money" },
          { key: "diff", label: "Difference", type: "money", tone: "auto" },
          { key: "note", label: "Note", type: "text", w: 4 },
        ],
        rows: closings.map((c) => ({ day: c.date, expected: c.expectedClosing, counted: c.actualCounted, diff: c.difference, note: c.note || "", _href: `/closing?date=${dayKey(c.date)}` })),
        totals: closings.length ? { day: "Total difference", diff: sumBy(closings, "difference") } : undefined,
      },
    ],
  };
}
