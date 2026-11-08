import Expense from "@/models/Expense";
import { METHOD_LABELS } from "@/lib/constants";
import { CATEGORY_META } from "@/lib/expense-meta";
import { inRange, pct, sumBy } from "@/lib/reports/common";

const catLabel = (c) => CATEGORY_META[c]?.label || c;
const payeeOf = (e) => (e.paidTo && e.paidTo.trim()) || "(no payee)";

// Expense report: grouped by category, then by payee/item, with every transaction. Only APPROVED expenses are
// listed and totalled; pending-approval ones are reported separately (not included) and rejected ones are left out.
// The web page adds a drill-down (`drill`).
export async function buildExpenseReport(r) {
  const [docs, pendingRows] = await Promise.all([
    Expense.find({ ...inRange(r), status: "approved" }).sort({ date: 1, createdAt: 1 }).populate("createdBy", "name").lean(),
    Expense.aggregate([{ $match: { ...inRange(r), status: "pending_approval" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);

  const total = sumBy(docs, "amount");
  const pendingTotal = pendingRows[0]?.total ?? 0;

  // category -> payee -> transactions
  const cats = new Map();
  for (const e of docs) {
    const c = cats.get(e.category) ?? { category: e.category, total: 0, n: 0, payees: new Map() };
    const p = c.payees.get(payeeOf(e)) ?? { payee: payeeOf(e), total: 0, n: 0, txs: [] };
    p.total += e.amount;
    p.n += 1;
    p.txs.push(e);
    c.payees.set(p.payee, p);
    c.total += e.amount;
    c.n += 1;
    cats.set(e.category, c);
  }
  const groups = [...cats.values()]
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ ...c, payees: [...c.payees.values()].sort((a, b) => b.total - a.total) }));

  const payeeRows = groups.flatMap((c) => c.payees.map((p) => ({ category: catLabel(c.category), payee: p.payee, n: p.n, amount: p.total, share: pct(p.total, c.total) })));
  const txRows = groups.flatMap((c) =>
    c.payees.flatMap((p) =>
      p.txs.map((e) => ({
        date: e.date,
        category: catLabel(e.category),
        payee: p.payee,
        method: METHOD_LABELS[e.method] || e.method,
        status: e.status === "pending_approval" ? "Pending approval" : "Approved",
        amount: e.amount,
        by: e.createdBy?.name || "",
        note: e.note || "",
        _href: `/expenses/${e._id}`,
      }))
    )
  );

  return {
    key: "expenses",
    title: "Expense report",
    filename: "expense-report",
    range: r,
    summary: [
      { label: "Total expenses", value: total, kind: "money", tone: "out" },
      { label: "Transactions", value: docs.length, kind: "int" },
      { label: "Biggest category", value: groups[0] ? `${catLabel(groups[0].category)} (${Math.round(pct(groups[0].total, total) * 100)}%)` : "—", kind: "text" },
      { label: "Awaiting approval (not included)", value: pendingTotal, kind: "money", tone: pendingTotal > 0 ? "out" : "neutral" },
    ],
    tables: [
      {
        id: "categories",
        title: "By category",
        columns: [
          { key: "category", label: "Category", type: "text", w: 3 },
          { key: "n", label: "Count", type: "int" },
          { key: "amount", label: "Amount", type: "money", tone: "out" },
          { key: "share", label: "Share", type: "pct" },
        ],
        rows: groups.map((c) => ({ category: catLabel(c.category), n: c.n, amount: c.total, share: pct(c.total, total) })),
        totals: { category: "Total", n: docs.length, amount: total, share: total > 0 ? 1 : 0 },
      },
      {
        id: "payees",
        title: "By category and payee / item",
        columns: [
          { key: "category", label: "Category", type: "text", w: 2 },
          { key: "payee", label: "Payee / item", type: "text", w: 3 },
          { key: "n", label: "Count", type: "int" },
          { key: "amount", label: "Amount", type: "money", tone: "out" },
          { key: "share", label: "Of category", type: "pct" },
        ],
        rows: payeeRows,
        totals: { category: "Total", n: docs.length, amount: total },
      },
      {
        id: "transactions",
        title: "All transactions",
        note: "Grouped by category, then payee, then date. Tap a row's date to open the expense.",
        columns: [
          { key: "date", label: "Date", type: "date", link: true },
          { key: "category", label: "Category", type: "text", w: 2 },
          { key: "payee", label: "Payee / item", type: "text", w: 3 },
          { key: "method", label: "Paid by", type: "text" },
          { key: "status", label: "Status", type: "text", w: 2 },
          { key: "amount", label: "Amount", type: "money", tone: "out" },
          { key: "by", label: "Entered by", type: "text", w: 2 },
          { key: "note", label: "Note", type: "text", w: 4 },
        ],
        rows: txRows,
        totals: { date: "Total", amount: total },
      },
    ],
    // Web page only: category -> payee -> transactions, expandable.
    drill: groups.map((c) => ({
      label: catLabel(c.category),
      total: c.total,
      n: c.n,
      payees: c.payees.map((p) => ({
        label: p.payee,
        total: p.total,
        n: p.n,
        txs: p.txs.map((e) => ({ id: String(e._id), date: e.date, amount: e.amount, method: METHOD_LABELS[e.method] || e.method, pending: e.status === "pending_approval", by: e.createdBy?.name || "", note: e.note || "" })),
      })),
    })),
  };
}
