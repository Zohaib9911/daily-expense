import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { METHOD_LABELS, PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { resolveDateRange } from "@/lib/date-range";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import Payment from "@/models/Payment";
import PaymentCard from "./PaymentCard";

export const metadata = { title: "Cash In" };

const PAGE_SIZE = 20;
const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function PaymentsPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  const range = resolveDateRange(sp);
  const type = PAYMENT_TYPES.includes(one(sp.type)) ? one(sp.type) : "";
  const method = PAYMENT_METHODS.includes(one(sp.method)) ? one(sp.method) : "";
  const showVoided = one(sp.voided) === "1";
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const filter = { date: { $gte: range.start, $lt: range.end } };
  if (type) filter.type = type;
  if (method) filter.method = method;

  await connectDB();
  const opts = { showVoided };
  const [docs, count, totals] = await Promise.all([
    Payment.find(filter)
      .setOptions(opts)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate("createdBy", "name")
      .populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } })
      .lean(),
    Payment.countDocuments(filter).setOptions(opts),
    Payment.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } }]), // voided excluded
  ]);

  const total = totals[0]?.total ?? 0;
  const received = totals[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (p) => {
    const q = new URLSearchParams();
    const params = { range: range.range, from: range.range === "custom" ? range.from : "", to: range.range === "custom" ? range.to : "", type, method, voided: showVoided ? "1" : "" };
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/payments?${q.toString()}`;
  };
  const filtered = Boolean(type || method || showVoided);

  return (
    <div className="space-y-4">
      <Card>
        <DateFilter />
      </Card>

      <Card>
        <p className="text-sm text-slate-500">Total received</p>
        <p className="text-3xl">
          <MoneyText amount={total} type="in" />
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {received} {received === 1 ? "payment" : "payments"}
        </p>
      </Card>

      <details open={filtered} className="rounded-2xl bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-slate-700">
          More filters{filtered ? " (active)" : ""}
        </summary>
        <form method="get" className="space-y-3 px-4 pb-4">
          <input type="hidden" name="range" value={range.range} />
          {range.range === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <div>
            <label htmlFor="f-type" className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
            <select id="f-type" name="type" defaultValue={type} className={inputClass}>
              <option value="">All types</option>
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-method" className="mb-1.5 block text-sm font-medium text-slate-700">Received by</label>
            <select id="f-method" name="method" defaultValue={method} className={inputClass}>
              <option value="">Any method</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" name="voided" value="1" defaultChecked={showVoided} className="h-5 w-5 rounded border-slate-300" />
            Include voided payments
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1`}>Apply</button>
            <Link href={`/payments?range=${range.range}${range.range === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`} className={btnGhost}>
              Clear
            </Link>
          </div>
        </form>
      </details>

      {WRITER_ROLES.includes(user.role) && (
        <Link href="/payments/new" className={`${btnPrimary} min-h-12 w-full`}>
          <Plus size={20} />
          Receive payment
        </Link>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No payments found"
          description={filtered ? "Try changing or clearing the filters." : "No money was received in this period."}
        />
      ) : (
        <ul className="space-y-3">
          {docs.map((p) => (
            <PaymentCard key={String(p._id)} p={p} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? <Link href={href(page - 1)} className={btnGhost}>Newer</Link> : <span />}
          <span className="text-sm text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className={btnGhost}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
