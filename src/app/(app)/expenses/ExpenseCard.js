import Link from "next/link";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { CATEGORY_META } from "@/lib/expense-meta";
import { formatDate } from "@/lib/dates";
import { ClipboardList } from "lucide-react";
import { thumbUrl } from "@/lib/validation/expense";

/** One expense as a mobile card (server component). `e` is a lean doc with createdBy populated. */
export default function ExpenseCard({ e }) {
  const { label, icon: Icon } = CATEGORY_META[e.category] ?? { label: e.category, icon: CATEGORY_META.misc.icon };

  return (
    <li>
      <Link
        href={`/expenses/${e._id}`}
        className={`flex min-w-0 gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${e.isVoided ? "opacity-70" : ""}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Icon size={22} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold text-slate-900">{label}</p>
            <MoneyText amount={e.amount} type="out" className={e.isVoided ? "line-through" : ""} />
          </div>
          {e.paidTo && <p className="truncate text-sm text-slate-600">To {e.paidTo}</p>}
          <p className="truncate text-xs text-slate-500">
            {formatDate(e.date)} · by {e.createdBy?.name || "Unknown"}
          </p>
          {e.order && (
            <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900">
              <ClipboardList size={12} className="shrink-0" />
              <span className="truncate">{e.order.orderNo} · {e.order.customerName}</span>
            </p>
          )}
          {(e.isVoided || e.isBackdated || e.status !== "approved") && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.isVoided && <StatusBadge status="voided" />}
              {e.status === "pending_approval" && <StatusBadge status="pending_approval" />}
              {e.status === "rejected" && <StatusBadge status="rejected" />}
              {e.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
            </div>
          )}
        </div>

        {e.receiptUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl(e.receiptUrl)}
            alt="Receipt"
            loading="lazy"
            className="h-14 w-14 shrink-0 self-center rounded-lg bg-slate-100 object-cover"
          />
        )}
      </Link>
    </li>
  );
}
