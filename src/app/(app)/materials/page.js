import Link from "next/link";
import mongoose from "mongoose";
import { Package, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { resolveDateRange } from "@/lib/date-range";
import { formatDate } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { thumbUrl } from "@/lib/validation/expense";
import MaterialPurchase from "@/models/MaterialPurchase";
import Supplier from "@/models/Supplier";

export const metadata = { title: "Raw Material" };

const PAGE_SIZE = 20;
const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function MaterialsPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  const range = resolveDateRange(sp);
  const supplierId = mongoose.isValidObjectId(one(sp.supplier)) ? one(sp.supplier) : "";
  const showVoided = one(sp.voided) === "1";
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const filter = { date: { $gte: range.start, $lt: range.end } };
  if (supplierId) filter.supplier = supplierId;

  await connectDB();
  const opts = { showVoided };
  const aggMatch = { ...filter };
  if (supplierId) aggMatch.supplier = new mongoose.Types.ObjectId(supplierId); // aggregate() doesn't cast

  const [docs, count, totals, suppliers] = await Promise.all([
    MaterialPurchase.find(filter).setOptions(opts).sort({ date: -1, createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).populate("supplier", "name").lean(),
    MaterialPurchase.countDocuments(filter).setOptions(opts),
    MaterialPurchase.aggregate([{ $match: aggMatch }, { $group: { _id: null, total: { $sum: "$totalAmount" }, paid: { $sum: "$paidAmount" }, due: { $sum: "$dueAmount" }, n: { $sum: 1 } } }]), // voided excluded
    Supplier.find().select("name").sort({ name: 1 }).lean(),
  ]);

  const t = totals[0] ?? { total: 0, paid: 0, due: 0, n: 0 };
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (p) => {
    const q = new URLSearchParams();
    const params = { range: range.range, from: range.range === "custom" ? range.from : "", to: range.range === "custom" ? range.to : "", supplier: supplierId, voided: showVoided ? "1" : "" };
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/materials?${q.toString()}`;
  };
  const filtered = Boolean(supplierId || showVoided);

  return (
    <div className="space-y-4">
      <Card>
        <DateFilter />
      </Card>

      <Card>
        <p className="text-sm text-slate-500">Total purchased</p>
        <p className="text-3xl"><MoneyText amount={t.total} type="out" /></p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Paid at purchase</dt>
            <dd><MoneyText amount={t.paid} /></dd>
          </div>
          <div>
            <dt className="text-slate-500">Left unpaid</dt>
            <dd><MoneyText amount={t.due} type={t.due > 0 ? "out" : "neutral"} /></dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">{t.n} {t.n === 1 ? "purchase" : "purchases"}</p>
      </Card>

      <details open={filtered} className="rounded-2xl bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-slate-700">More filters{filtered ? " (active)" : ""}</summary>
        <form method="get" className="space-y-3 px-4 pb-4">
          <input type="hidden" name="range" value={range.range} />
          {range.range === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <div>
            <label htmlFor="f-supplier" className="mb-1.5 block text-sm font-medium text-slate-700">Supplier</label>
            <select id="f-supplier" name="supplier" defaultValue={supplierId} className={inputClass}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={String(s._id)} value={String(s._id)}>{s.name}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" name="voided" value="1" defaultChecked={showVoided} className="h-5 w-5 rounded border-slate-300" />
            Include voided purchases
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1`}>Apply</button>
            <Link href={`/materials?range=${range.range}${range.range === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`} className={btnGhost}>Clear</Link>
          </div>
        </form>
      </details>

      {WRITER_ROLES.includes(user.role) && (
        <Link href="/materials/new" className={`${btnPrimary} min-h-12 w-full`}>
          <Plus size={20} />
          Buy material
        </Link>
      )}

      {docs.length === 0 ? (
        <EmptyState icon={Package} title="No purchases found" description={filtered ? "Try changing or clearing the filters." : "No material was bought in this period."} />
      ) : (
        <ul className="space-y-3">
          {docs.map((p) => (
            <li key={String(p._id)}>
              <Link href={`/materials/${p._id}`} className={`flex min-w-0 gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${p.isVoided ? "opacity-70" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-slate-900">{p.supplier?.name || "Unknown supplier"}</p>
                    <MoneyText amount={p.totalAmount} type="out" className={p.isVoided ? "line-through" : ""} />
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {p.items.length} {p.items.length === 1 ? "item" : "items"}: {p.items.map((i) => i.name).join(", ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(p.date)} · paid <MoneyText amount={p.paidAmount} className="!text-xs !font-medium !text-slate-600" />
                    {p.dueAmount > 0 && (
                      <>
                        {" "}· due <MoneyText amount={p.dueAmount} type="out" className="!text-xs" />
                      </>
                    )}
                  </p>
                  {(p.isVoided || p.isBackdated) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.isVoided && <StatusBadge status="voided" />}
                      {p.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
                    </div>
                  )}
                </div>
                {p.receiptUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl(p.receiptUrl)} alt="Bill" loading="lazy" className="h-14 w-14 shrink-0 self-center rounded-lg bg-slate-100 object-cover" />
                )}
              </Link>
            </li>
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
