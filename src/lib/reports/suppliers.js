import MaterialPurchase from "@/models/MaterialPurchase";
import Supplier from "@/models/Supplier";
import SupplierPayment from "@/models/SupplierPayment";
import { METHOD_LABELS } from "@/lib/constants";
import { balancesFor } from "@/lib/supplier-money";
import { inRange, sumBy } from "@/lib/reports/common";

// Supplier report. Purchases and payments are those dated in the range; "Total due (today)" is the supplier's
// full khata balance now (opening + all purchases - everything paid), not limited to the range.
export async function buildSupplierReport(r) {
  const [suppliers, purchases, payments] = await Promise.all([
    Supplier.find().sort({ name: 1 }).lean(),
    MaterialPurchase.find(inRange(r)).sort({ date: 1, createdAt: 1 }).populate("supplier", "name").lean(),
    SupplierPayment.find(inRange(r)).sort({ date: 1, createdAt: 1 }).populate("supplier", "name").lean(),
  ]);
  const balances = await balancesFor(suppliers);

  const per = new Map(suppliers.map((s) => [String(s._id), { name: s.name, active: s.active, n: 0, purchased: 0, paidAtPurchase: 0, paid: 0, due: balances.get(String(s._id))?.due ?? 0 }]));
  for (const p of purchases) {
    const x = per.get(String(p.supplier?._id ?? p.supplier));
    if (!x) continue;
    x.n += 1;
    x.purchased += p.totalAmount;
    x.paidAtPurchase += p.paidAmount;
  }
  for (const p of payments) {
    const x = per.get(String(p.supplier?._id ?? p.supplier));
    if (x) x.paid += p.amount;
  }
  const rows = [...per.values()].filter((x) => x.active || x.purchased || x.paid || x.due !== 0).map((x) => ({ ...x, paidTotal: x.paidAtPurchase + x.paid }));
  const dues = rows.filter((x) => x.due > 0);

  return {
    key: "suppliers",
    title: "Supplier report",
    filename: "supplier-report",
    range: r,
    summary: [
      { label: "Purchases", value: sumBy(rows, "purchased"), kind: "money", tone: "out" },
      { label: "Paid (at purchase + payments)", value: sumBy(rows, "paidTotal"), kind: "money", tone: "in" },
      { label: "Total due to suppliers (today)", value: sumBy(dues, "due"), kind: "money", tone: sumBy(dues, "due") > 0 ? "out" : "neutral" },
      { label: "Suppliers with a balance", value: dues.length, kind: "int" },
    ],
    tables: [
      {
        id: "suppliers",
        title: "By supplier",
        note: "Total due (today) is the full balance now. Negative means we paid in advance.",
        columns: [
          { key: "name", label: "Supplier", type: "text", w: 3 },
          { key: "n", label: "Purchases", type: "int" },
          { key: "purchased", label: "Purchased", type: "money", tone: "out" },
          { key: "paidAtPurchase", label: "Paid at purchase", type: "money" },
          { key: "paid", label: "Later payments", type: "money", tone: "in" },
          { key: "due", label: "Total due (today)", type: "money", tone: "out" },
        ],
        rows,
        totals: { name: "Total", n: sumBy(rows, "n"), purchased: sumBy(rows, "purchased"), paidAtPurchase: sumBy(rows, "paidAtPurchase"), paid: sumBy(rows, "paid"), due: sumBy(rows, "due") },
      },
      {
        id: "purchases",
        title: "Purchases",
        columns: [
          { key: "date", label: "Date", type: "date", link: true },
          { key: "supplier", label: "Supplier", type: "text", w: 3 },
          { key: "items", label: "Items", type: "text", w: 4 },
          { key: "total", label: "Total", type: "money", tone: "out" },
          { key: "paid", label: "Paid now", type: "money" },
          { key: "due", label: "Left unpaid", type: "money", tone: "out" },
        ],
        rows: purchases.map((p) => ({ date: p.date, supplier: p.supplier?.name || "", items: p.items.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(", "), total: p.totalAmount, paid: p.paidAmount, due: p.dueAmount, _href: `/materials/${p._id}` })),
        totals: { date: "Total", total: sumBy(purchases, "totalAmount"), paid: sumBy(purchases, "paidAmount"), due: sumBy(purchases, "dueAmount") },
      },
      {
        id: "payments",
        title: "Payments to suppliers",
        columns: [
          { key: "date", label: "Date", type: "date", link: true },
          { key: "supplier", label: "Supplier", type: "text", w: 3 },
          { key: "amount", label: "Amount", type: "money", tone: "in" },
          { key: "method", label: "Paid by", type: "text" },
          { key: "note", label: "Note", type: "text", w: 4 },
        ],
        rows: payments.map((p) => ({ date: p.date, supplier: p.supplier?.name || "", amount: p.amount, method: METHOD_LABELS[p.method] || p.method, note: p.note || "", _href: `/suppliers/${p.supplier?._id}` })),
        totals: { date: "Total", amount: sumBy(payments, "amount") },
      },
    ],
  };
}
