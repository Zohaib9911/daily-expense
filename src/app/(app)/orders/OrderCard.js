import Link from "next/link";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { deliveryInfo } from "@/lib/order-meta";

function Figure({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm">{children}</p>
    </div>
  );
}

/** One order as a mobile card (server component). `o` is a lean Order doc. */
export default function OrderCard({ o }) {
  const delivery = deliveryInfo(o.deliveryDate, o.status);
  const balance = o.netAmount - o.advanceReceived;

  return (
    <li>
      <Link href={`/orders/${o._id}`} className="block min-w-0 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{o.orderNo}</p>
            <p className="truncate text-base font-semibold text-slate-900">{o.customerName}</p>
          </div>
          <StatusBadge status={o.status} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Figure label="Net">
            <MoneyText amount={o.netAmount} />
          </Figure>
          <Figure label="Received">
            <MoneyText amount={o.advanceReceived} type="in" />
          </Figure>
          <Figure label="Balance">
            {balance > 0 ? <MoneyText amount={balance} type="out" /> : <span className="font-semibold text-green-600">Paid</span>}
          </Figure>
        </div>

        {delivery && (
          <p className={`mt-3 text-sm ${delivery.className}`}>
            <span className="text-slate-500">Delivery: </span>
            {delivery.text}
          </p>
        )}
      </Link>
    </li>
  );
}
