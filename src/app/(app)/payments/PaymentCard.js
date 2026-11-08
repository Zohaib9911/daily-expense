import Link from "next/link";
import { HandCoins } from "lucide-react";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { METHOD_LABELS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { thumbUrl } from "@/lib/validation/expense";

/** One payment as a mobile card (server component). `p` is a lean Payment with createdBy and order populated. */
export default function PaymentCard({ p }) {
  return (
    <li>
      <Link
        href={`/payments/${p._id}`}
        className={`flex min-w-0 gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${p.isVoided ? "opacity-70" : ""}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
          <HandCoins size={22} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold text-slate-900">{PAYMENT_TYPE_LABELS[p.type]}</p>
            <MoneyText amount={p.amount} type="in" className={p.isVoided ? "line-through" : ""} />
          </div>
          {p.order && (
            <p className="truncate text-sm text-slate-600">
              {p.order.orderNo} · {p.order.customerName}
            </p>
          )}
          <p className="truncate text-xs text-slate-500">
            {formatDate(p.date)} · {METHOD_LABELS[p.method]} · by {p.createdBy?.name || "Unknown"}
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
          <img src={thumbUrl(p.receiptUrl)} alt="Receipt" loading="lazy" className="h-14 w-14 shrink-0 self-center rounded-lg bg-slate-100 object-cover" />
        )}
      </Link>
    </li>
  );
}
