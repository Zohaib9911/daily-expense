import Link from "next/link";
import { Search, Truck, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { balancesFor } from "@/lib/supplier-money";
import { btnPrimary, inputClass } from "@/lib/ui";
import Supplier from "@/models/Supplier";

export const metadata = { title: "Suppliers" };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function SuppliersPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 60);
  const showInactive = one(sp.inactive) === "1";
  const writer = WRITER_ROLES.includes(user.role);

  const filter = showInactive ? {} : { active: true };
  if (q) {
    const digits = q.replace(/\D/g, "");
    filter.$or = [
      { name: new RegExp(escapeRegex(q), "i") },
      ...(digits.length >= 3 ? [{ phone: new RegExp(digits.split("").join("\\D*")) }] : []),
    ];
  }

  await connectDB();
  const all = await Supplier.find(showInactive ? {} : { active: true }).lean();
  const [suppliers, balances] = await Promise.all([Supplier.find(filter).sort({ active: -1, name: 1 }).lean(), balancesFor(all)]);

  const totalDue = [...balances.values()].reduce((s, b) => s + Math.max(0, b.due), 0);
  const href = (extra) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/suppliers?${s}` : "/suppliers";
  };

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Total due to suppliers</p>
        <p className="text-3xl"><MoneyText amount={totalDue} type={totalDue > 0 ? "out" : "neutral"} /></p>
      </Card>

      <form method="get" role="search" className="flex gap-2">
        {showInactive && <input type="hidden" name="inactive" value="1" />}
        <input type="search" name="q" defaultValue={q} placeholder="Supplier name or phone" aria-label="Search suppliers" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" aria-label="Search" className={`${btnPrimary} w-12 shrink-0 px-0`}>
          <Search size={20} />
        </button>
      </form>

      {writer && (
        <Link href="/suppliers/new" className={`${btnPrimary} min-h-12 w-full`}>
          <UserPlus size={20} />
          Add supplier
        </Link>
      )}

      {suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers found" description={q ? `Nothing matches "${q}".` : "Add your first supplier to start a khata."} />
      ) : (
        <ul className="space-y-3">
          {suppliers.map((s) => {
            const due = balances.get(String(s._id))?.due ?? s.openingBalance ?? 0;
            return (
              <li key={String(s._id)}>
                <Link href={`/suppliers/${s._id}`} className={`block min-w-0 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${s.active ? "" : "opacity-70"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{s.name}</p>
                      <p className="truncate text-sm text-slate-500">{s.phone || "No phone"}</p>
                    </div>
                    {!s.active && <StatusBadge status="inactive" />}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-xs uppercase tracking-wide text-slate-500">{due < 0 ? "Advance with supplier" : "Total due"}</span>
                    {due > 0 ? (
                      <MoneyText amount={due} type="out" className="text-lg" />
                    ) : due < 0 ? (
                      <span className="text-lg font-semibold text-green-600">{formatPKR(-due)}</span>
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">Settled</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center">
        <Link href={href({ inactive: showInactive ? "" : "1" })} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-900">
          {showInactive ? "Hide inactive suppliers" : "Show inactive suppliers"}
        </Link>
      </p>
    </div>
  );
}
