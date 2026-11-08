import { eachDay, closingOn, dayFigures, openingFor } from "@/lib/closing";
import { dayKey, dayRange, startOfDayKarachi, todayKarachi } from "@/lib/dates";
import { resolveDateRange } from "@/lib/date-range";
import { currentMonth, monthRange } from "@/lib/salary";
import { balancesFor } from "@/lib/supplier-money";
import { outstandingByStaff } from "@/lib/staff-money";
import DailyClosing from "@/models/DailyClosing";
import Expense from "@/models/Expense";
import MaterialPurchase from "@/models/MaterialPurchase";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import SalaryPayment from "@/models/SalaryPayment";
import StaffAdvance from "@/models/StaffAdvance";
import Supplier from "@/models/Supplier";
import SupplierPayment from "@/models/SupplierPayment";

// Server-only. Every number on the dashboard is calculated here, in MongoDB, from the real records.
// Voided records are always left out (the models' default guard). "Money in" = Payments (any method);
// "money out" = APPROVED Expenses only. Pending-approval expenses are not counted until the owner approves
// them (they are reported separately); rejected ones never count. Auto-created expenses (advances, salaries, purchases, supplier payments) are Expenses,
// so nothing is counted twice: we never add the source records' own amounts on top.

const sum = (rows, key = "total") => rows.reduce((s, r) => s + (r[key] || 0), 0);

/* ----------------------------------------------------------------- top cards */

/** In/out for the selected period (the DateFilter range). */
export async function periodTotals(range) {
  const match = { date: { $gte: range.start, $lt: range.end } };
  const [pay, exp] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: "$method", total: { $sum: "$amount" } } }]),
    Expense.aggregate([
      { $match: { ...match, status: { $ne: "rejected" } } },
      { $group: { _id: { method: "$method", status: "$status" }, total: { $sum: "$amount" } } },
    ]),
  ]);
  const inCash = pay.find((r) => r._id === "cash")?.total ?? 0;
  const approved = exp.filter((r) => r._id.status === "approved");
  const outCash = sum(approved.filter((r) => r._id.method === "cash"));
  const inAll = sum(pay);
  const outAll = sum(approved);
  const pendingOut = sum(exp.filter((r) => r._id.status === "pending_approval"));
  return { inAll, inCash, outAll, outCash, pendingOut, profit: inAll - outAll };
}

/**
 * Cash in the drawer: today's counted cash once today is closed, otherwise the live expected cash
 * (last closed count + movement since). With no closed day yet there is nothing to build on.
 */
export async function cashInHand() {
  const today = todayKarachi();
  const closing = await closingOn(today);
  if (closing?.isLocked) return { kind: "counted", value: closing.actualCounted, difference: closing.difference };

  const opening = await openingFor(today);
  if (opening.kind === "first") return { kind: "none" };
  const fig = await dayFigures(today);
  return { kind: "live", value: opening.value + fig.cashIn - fig.cashOut, lastCounted: opening.counted, lastKey: opening.prevKey };
}

/* -------------------------------------------------------------------- alerts */

export async function alerts(user) {
  const today = todayKarachi();
  const yesterday = dayKey(new Date(startOfDayKarachi(today).getTime() - 12 * 60 * 60 * 1000));
  const month = monthRange(currentMonth());
  const week = resolveDateRange({ range: "week" });
  const startOfToday = startOfDayKarachi(today);

  const BACKDATED = [
    ["expense", Expense],
    ["payment", Payment],
    ["order", Order],
    ["purchase", MaterialPurchase],
    ["supplier payment", SupplierPayment],
    ["advance", StaffAdvance],
    ["salary payment", SalaryPayment],
  ];

  const [first, yClosing, mismatches, pending, overdue, ...backdated] = await Promise.all([
    DailyClosing.findOne({}).sort({ date: 1 }).lean(),
    closingOn(yesterday),
    DailyClosing.find({ date: { $gte: month.start, $lt: month.end }, isLocked: true, difference: { $ne: 0 } }).lean(),
    user.role === "admin"
      ? Expense.aggregate([{ $match: { status: "pending_approval" } }, { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } }])
      : Promise.resolve([]),
    Order.countDocuments({ status: { $in: ["pending", "in_production", "ready"] }, deliveryDate: { $lt: startOfToday } }),
    ...BACKDATED.map(([, M]) => M.countDocuments({ isBackdated: true, createdAt: { $gte: week.start, $lt: week.end } })),
  ]);

  const out = [];
  if (first && dayKey(first.date) <= yesterday && !yClosing?.isLocked) {
    out.push({ key: "yesterday", tone: "amber", text: "Yesterday was not closed", href: `/closing?date=${yesterday}`, cta: "Close it" });
  }
  if (mismatches.length) {
    const total = mismatches.reduce((s, c) => s + c.difference, 0);
    out.push({
      key: "mismatch",
      tone: "red",
      text: `${mismatches.length} ${mismatches.length === 1 ? "day" : "days"} with a cash difference this month`,
      detail: { amount: total },
      href: "/closing/history",
      cta: "See days",
    });
  }
  if (pending[0]?.n) {
    out.push({
      key: "approvals",
      tone: "amber",
      text: `${pending[0].n} ${pending[0].n === 1 ? "expense" : "expenses"} waiting for your approval`,
      detail: { money: pending[0].total },
      href: "/approvals",
      cta: "Review",
    });
  }
  if (overdue) {
    out.push({ key: "overdue", tone: "red", text: `${overdue} overdue ${overdue === 1 ? "order" : "orders"}`, href: "/orders?tab=all", cta: "View orders" });
  }
  const counts = BACKDATED.map(([label], i) => ({ label, n: backdated[i] })).filter((c) => c.n > 0);
  const backdatedTotal = counts.reduce((s, c) => s + c.n, 0);
  if (backdatedTotal) {
    out.push({
      key: "backdated",
      tone: "blue",
      text: `${backdatedTotal} backdated ${backdatedTotal === 1 ? "entry" : "entries"} entered this week`,
      sub: counts.map((c) => `${c.n} ${c.label}${c.n === 1 ? "" : "s"}`).join(", "),
      href: user.role === "admin" ? "/audit-log" : undefined,
      cta: user.role === "admin" ? "Audit log" : undefined,
    });
  }
  return out;
}

/* ------------------------------------------------------------- pending money */

export async function pendingMoney() {
  const [customers, suppliers, advances] = await Promise.all([
    Order.aggregate([{ $match: { status: { $ne: "cancelled" }, balance: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$balance" }, n: { $sum: 1 } } }]),
    Supplier.find().lean(),
    outstandingByStaff(),
  ]);
  const balances = await balancesFor(suppliers);
  const dues = [...balances.values()].map((b) => b.due).filter((d) => d > 0);
  const owedByStaff = [...advances.values()].filter((v) => v > 0);
  return {
    customers: { total: customers[0]?.total ?? 0, n: customers[0]?.n ?? 0 },
    suppliers: { total: dues.reduce((s, d) => s + d, 0), n: dues.length },
    advances: { total: owedByStaff.reduce((s, d) => s + d, 0), n: owedByStaff.length },
  };
}

/* ------------------------------------------------------------------- charts */

/** Expense totals by category for a month, biggest first. */
export async function expenseByCategory(month) {
  const { start, end } = monthRange(month);
  const rows = await Expense.aggregate([
    { $match: { date: { $gte: start, $lt: end }, status: "approved" } },
    { $group: { _id: "$category", total: { $sum: "$amount" }, n: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, total: r.total, n: r.n }));
}

/** Money in and out for each of the last 30 days (oldest first), zero-filled. */
export async function dailySeries(days = 30) {
  const to = todayKarachi();
  const from = dayKey(new Date(startOfDayKarachi(to).getTime() - (days - 1) * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));
  const range = { $gte: startOfDayKarachi(from), $lt: dayRange(to).end };
  const perDay = { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Karachi" } };
  const [pay, exp] = await Promise.all([
    Payment.aggregate([{ $match: { date: range } }, { $group: { _id: perDay, total: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { date: range, status: "approved" } }, { $group: { _id: perDay, total: { $sum: "$amount" } } }]),
  ]);
  const p = new Map(pay.map((r) => [r._id, r.total]));
  const e = new Map(exp.map((r) => [r._id, r.total]));
  return eachDay(from, to).map((key) => ({ key, in: p.get(key) ?? 0, out: e.get(key) ?? 0 }));
}

export async function ordersByStatus() {
  const rows = await Order.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/* ------------------------------------------------------------ recent activity */

/**
 * The last 10 money entries (by the time they were ENTERED), with who entered them. Expenses that were
 * created automatically by an advance / salary / purchase / supplier payment are skipped: their source
 * record is already in the list, so each action appears once.
 */
export async function recentActivity(limit = 10) {
  const by = ["createdBy", "name"];
  const [payments, expenses, purchases, supplierPayments, advances, salaries] = await Promise.all([
    Payment.find().sort({ createdAt: -1 }).limit(limit).populate(...by).populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } }).lean(),
    Expense.find({ sourceType: null, status: { $ne: "rejected" } }).sort({ createdAt: -1 }).limit(limit).populate(...by).lean(),
    MaterialPurchase.find().sort({ createdAt: -1 }).limit(limit).populate(...by).populate("supplier", "name").lean(),
    SupplierPayment.find().sort({ createdAt: -1 }).limit(limit).populate(...by).populate("supplier", "name").lean(),
    StaffAdvance.find().sort({ createdAt: -1 }).limit(limit).populate(...by).populate("staff", "name").lean(),
    SalaryPayment.find().sort({ createdAt: -1 }).limit(limit).populate(...by).populate("staff", "name").lean(),
  ]);

  const items = [
    ...payments.map((p) => ({ key: `pay${p._id}`, href: `/payments/${p._id}`, at: p.createdAt, dir: "in", kind: "Payment received", sub: p.order ? `${p.order.orderNo} · ${p.order.customerName}` : p.note || "Other income", amount: p.amount, who: p.createdBy?.name, backdated: p.isBackdated })),
    ...expenses.map((e) => ({ key: `exp${e._id}`, href: `/expenses/${e._id}`, at: e.createdAt, dir: "out", kind: "Expense", category: e.category, sub: e.paidTo || "", amount: e.amount, who: e.createdBy?.name, backdated: e.isBackdated, pending: e.status === "pending_approval" })),
    ...purchases.map((p) => ({ key: `pur${p._id}`, href: `/materials/${p._id}`, at: p.createdAt, dir: "out", kind: "Material purchase", sub: `${p.supplier?.name || "Supplier"} · paid ${p.paidAmount}`, paidNote: true, amount: p.totalAmount, who: p.createdBy?.name, backdated: p.isBackdated, paid: p.paidAmount })),
    ...supplierPayments.map((p) => ({ key: `sp${p._id}`, href: `/suppliers/${p.supplier?._id}`, at: p.createdAt, dir: "out", kind: "Supplier payment", sub: p.supplier?.name || "", amount: p.amount, who: p.createdBy?.name, backdated: p.isBackdated })),
    ...advances.map((a) => ({ key: `adv${a._id}`, href: `/staff/${a.staff?._id}`, at: a.createdAt, dir: "out", kind: "Staff advance", sub: a.staff?.name || "", amount: a.amount, who: a.createdBy?.name, backdated: a.isBackdated })),
    ...salaries.map((s) => ({ key: `sal${s._id}`, href: `/staff/${s.staff?._id}`, at: s.createdAt, dir: "out", kind: "Salary paid", sub: `${s.staff?.name || ""} · ${s.month}`, amount: s.netPaid, who: s.createdBy?.name, backdated: s.isBackdated })),
  ];
  return items.sort((a, b) => b.at - a.at).slice(0, limit).map((i) => ({ ...i, at: i.at.toISOString() }));
}

