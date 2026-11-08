import Expense from "@/models/Expense";
import Payment from "@/models/Payment";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { CATEGORY_META } from "@/lib/expense-meta";
import { addMonths, currentMonth, monthLabel, monthRange } from "@/lib/salary";
import { inRange, pct, sumBy } from "@/lib/reports/common";

// Profit & Loss (cash basis): sales = Payments received, expenses = APPROVED Expenses (pending-approval ones
// are not counted until approved; rejected never). Credit purchases and unpaid customer balances are not included until paid.
export async function buildProfitLoss(r) {
  const endMonth = r.to.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(endMonth, i - 5));
  const span = { $gte: monthRange(months[0]).start, $lt: monthRange(endMonth).end };
  const perMonth = { $dateToString: { format: "%Y-%m", date: "$date", timezone: "Asia/Karachi" } };

  const [income, expenses, pending, salesByMonth, spendByMonth] = await Promise.all([
    Payment.aggregate([{ $match: inRange(r) }, { $group: { _id: "$type", total: { $sum: "$amount" }, n: { $sum: 1 } } }]),
    Expense.aggregate([
      { $match: { ...inRange(r), status: "approved" } },
      { $group: { _id: "$category", total: { $sum: "$amount" }, n: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([{ $match: { ...inRange(r), status: "pending_approval" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $match: { date: span } }, { $group: { _id: perMonth, total: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { date: span, status: "approved" } }, { $group: { _id: perMonth, total: { $sum: "$amount" } } }]),
  ]);

  const sales = sumBy(income, "total");
  const spent = sumBy(expenses, "total");
  const profit = sales - spent;

  const sm = new Map(salesByMonth.map((x) => [x._id, x.total]));
  const em = new Map(spendByMonth.map((x) => [x._id, x.total]));
  let prev = null;
  const monthly = months.map((m) => {
    const s = sm.get(m) ?? 0;
    const e = em.get(m) ?? 0;
    const row = { month: `${monthLabel(m)}${m === currentMonth() ? " (so far)" : ""}`, sales: s, expenses: e, profit: s - e, change: prev === null ? null : s - e - prev };
    prev = s - e;
    return row;
  });

  return {
    key: "profit-loss",
    title: "Profit & Loss",
    filename: "profit-loss-report",
    range: r,
    summary: [
      { label: "Total sales (received)", value: sales, kind: "money", tone: "in" },
      { label: "Total expenses", value: spent, kind: "money", tone: "out" },
      { label: "Net profit", value: profit, kind: "money", tone: "auto" },
      { label: "Profit margin", value: pct(profit, sales), kind: "pct", tone: "auto" },
    ],
    tables: [
      {
        id: "income",
        title: "Sales received",
        columns: [
          { key: "type", label: "Type", type: "text", w: 3 },
          { key: "n", label: "Payments", type: "int" },
          { key: "amount", label: "Amount", type: "money", tone: "in" },
        ],
        rows: income.map((x) => ({ type: PAYMENT_TYPE_LABELS[x._id] || x._id, n: x.n, amount: x.total })).sort((a, b) => b.amount - a.amount),
        totals: { type: "Total sales", n: sumBy(income, "n"), amount: sales },
      },
      {
        id: "expenses",
        title: "Expenses by category",
        note: pending[0]?.total ? `Not included: ${pending[0].total.toLocaleString("en-US")} rupees still waiting for approval. Only approved expenses count; rejected ones are excluded.` : "Only approved expenses count; rejected ones are excluded.",
        columns: [
          { key: "category", label: "Category", type: "text", w: 3 },
          { key: "n", label: "Count", type: "int" },
          { key: "amount", label: "Amount", type: "money", tone: "out" },
          { key: "share", label: "Share", type: "pct" },
        ],
        rows: expenses.map((x) => ({ category: CATEGORY_META[x._id]?.label || x._id, n: x.n, amount: x.total, share: pct(x.total, spent) })),
        totals: { category: "Total expenses", n: sumBy(expenses, "n"), amount: spent, share: spent > 0 ? 1 : 0 },
      },
      {
        id: "net",
        title: "Net profit for the period",
        columns: [
          { key: "label", label: "", type: "text", w: 3 },
          { key: "amount", label: "Amount", type: "money", tone: "auto" },
        ],
        rows: [
          { label: "Sales received", amount: sales },
          { label: "Less: expenses", amount: -spent },
        ],
        totals: { label: "Net profit", amount: profit },
      },
      {
        id: "monthly",
        title: "Last 6 months",
        note: `The six months up to ${monthLabel(endMonth)}. Each month is a whole calendar month, independent of the date range above.`,
        columns: [
          { key: "month", label: "Month", type: "text", w: 3 },
          { key: "sales", label: "Sales", type: "money", tone: "in" },
          { key: "expenses", label: "Expenses", type: "money", tone: "out" },
          { key: "profit", label: "Profit", type: "money", tone: "auto" },
          { key: "change", label: "vs previous month", type: "money", tone: "auto" },
        ],
        rows: monthly,
        totals: { month: "6-month total", sales: sumBy(monthly, "sales"), expenses: sumBy(monthly, "expenses"), profit: sumBy(monthly, "profit") },
      },
    ],
  };
}
