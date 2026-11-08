import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { METHOD_LABELS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { TIMEZONE, dayRange } from "@/lib/dates";
import { CATEGORY_META } from "@/lib/expense-meta";
import { formatInTimeZone } from "date-fns-tz";
import Expense from "@/models/Expense";
import Payment from "@/models/Payment";

const LIMIT = 300;

/** Every payment (money in) and expense (money out) dated on the day, oldest first, in an expandable box. */
export default async function DayBreakdown({ dateKey }) {
  const { start, end } = dayRange(dateKey);
  const range = { $gte: start, $lt: end };
  const [payments, expenses] = await Promise.all([
    Payment.find({ date: range }).setOptions({ showVoided: true }).sort({ date: 1 }).limit(LIMIT).populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } }).lean(),
    Expense.find({ date: range }).setOptions({ showVoided: true }).sort({ date: 1 }).limit(LIMIT).lean(),
  ]);

  const rows = [
    ...payments.map((p) => ({
      key: `p${p._id}`,
      href: `/payments/${p._id}`,
      date: p.date,
      inflow: true,
      title: PAYMENT_TYPE_LABELS[p.type] || "Payment",
      sub: p.order ? `${p.order.orderNo} · ${p.order.customerName}` : p.note || "",
      method: p.method,
      amount: p.amount,
      voided: p.isVoided,
    })),
    ...expenses.map((e) => ({
      key: `e${e._id}`,
      href: `/expenses/${e._id}`,
      date: e.date,
      inflow: false,
      title: CATEGORY_META[e.category]?.label || e.category,
      sub: e.paidTo || "",
      method: e.method,
      amount: e.amount,
      voided: e.isVoided,
      status: e.status,
    })),
  ].sort((a, b) => a.date - b.date);

  return (
    <details className="group rounded-2xl bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-800">
        <span>All transactions of the day ({rows.length})</span>
        <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No payments or expenses are dated on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className={`flex items-center gap-3 py-3 ${r.voided ? "opacity-60" : ""}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.inflow ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                    {r.inflow ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {formatInTimeZone(r.date, TIMEZONE, "h:mm a")} · {METHOD_LABELS[r.method] || r.method}
                      {r.sub ? ` · ${r.sub}` : ""}
                    </span>
                    {(r.voided || r.status === "pending_approval" || r.status === "rejected") && (
                      <span className="mt-1 flex gap-1.5">
                        {r.voided && <StatusBadge status="voided" />}
                        {r.status === "pending_approval" && <StatusBadge status="pending_approval" />}
                        {r.status === "rejected" && <StatusBadge status="rejected" />}
                      </span>
                    )}
                  </span>
                  <MoneyText amount={r.amount} type={r.inflow ? "in" : "out"} sign className={`text-sm ${r.voided ? "line-through" : ""}`} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Only approved, non-voided cash entries count towards the cash drawer.</p>
      </div>
    </details>
  );
}
