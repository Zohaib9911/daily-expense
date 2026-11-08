import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import VoidRecordButton from "@/components/VoidRecordButton";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { resolveDateRange } from "@/lib/date-range";
import { formatDate } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { btnPrimary } from "@/lib/ui";
import StaffAdvance from "@/models/StaffAdvance";
import { voidAdvance } from "./actions";

export const metadata = { title: "Staff Advances" };

export default async function AdvancesPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const filter = { date: { $gte: range.start, $lt: range.end } };

  await connectDB();
  const [docs, totals, open] = await Promise.all([
    StaffAdvance.find(filter).setOptions({ showVoided: true }).sort({ date: -1, createdAt: -1 }).limit(100).populate("staff", "name").lean(),
    StaffAdvance.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } }]), // voided excluded
    StaffAdvance.aggregate([{ $group: { _id: null, due: { $sum: { $subtract: ["$amount", "$recoveredAmount"] } } } }]),
  ]);
  const writer = WRITER_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <Card>
        <DateFilter />
      </Card>
      <Card>
        <p className="text-sm text-slate-500">Advances given</p>
        <p className="text-3xl"><MoneyText amount={totals[0]?.total ?? 0} type="out" /></p>
        <p className="mt-1 text-sm text-slate-500">
          {totals[0]?.n ?? 0} in this period · {formatPKR(open[0]?.due ?? 0)} not yet recovered from salaries (all time)
        </p>
      </Card>

      {writer && (
        <Link href="/advances/new" className={`${btnPrimary} min-h-12 w-full`}>
          <Plus size={20} />
          Give advance
        </Link>
      )}

      {docs.length === 0 ? (
        <EmptyState icon={Wallet} title="No advances found" description="No advances were given in this period." />
      ) : (
        <ul className="space-y-3">
          {docs.map((a) => (
            <li key={String(a._id)} className={`min-w-0 rounded-2xl bg-white p-4 shadow-sm ${a.isVoided ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/staff/${a.staff?._id}`} className="block truncate font-semibold text-slate-900 hover:underline">
                    {a.staff?.name || "Unknown staff"}
                  </Link>
                  <p className="text-xs text-slate-500">{formatDate(a.date)} · {METHOD_LABELS[a.method] || "Cash"}</p>
                  {a.note && <p className="break-words text-sm text-slate-600">{a.note}</p>}
                </div>
                <MoneyText amount={a.amount} type="out" className={a.isVoided ? "line-through" : ""} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {a.isVoided ? null : a.isFullyRecovered ? "Fully recovered" : `Recovered ${formatPKR(a.recoveredAmount)} · due ${formatPKR(a.amount - a.recoveredAmount)}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {a.isVoided && <StatusBadge status="voided" />}
                {a.isBackdated && !a.isVoided && <StatusBadge status="backdated" label="Backdated" />}
                {writer && !a.isVoided && (
                  <VoidRecordButton
                    action={voidAdvance} successMessage="Advance voided"
                    id={String(a._id)}
                    title="Void this advance?"
                    description={`${formatPKR(a.amount)} advance to ${a.staff?.name || "staff"}. Its expense is voided too.`}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
