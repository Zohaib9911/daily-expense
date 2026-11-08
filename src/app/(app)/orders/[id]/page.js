import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { FileText, HandCoins, MessageCircle, Phone, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import AuditHistory from "@/components/AuditHistory";
import { thumbUrl } from "@/lib/validation/expense";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { METHOD_LABELS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { CATEGORY_META } from "@/lib/expense-meta";
import { WRITER_ROLES } from "@/lib/nav";
import { costsByOrder, orderProfit } from "@/lib/order-profit";
import { deliveryInfo } from "@/lib/order-meta";
import { buildOrderMessage, whatsappLink } from "@/lib/order-share";
import { formatPKR } from "@/lib/format";
import { getShopName } from "@/lib/shop";
import { btnGhost, btnPrimary } from "@/lib/ui";
import AuditLog from "@/models/AuditLog";
import Expense from "@/models/Expense";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import OrderStatusActions from "../OrderStatusActions";

export const metadata = { title: "Order" };

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const o = await Order.findById(id).setOptions({ showVoided: true }).populate("createdBy", "name").lean();
  if (!o) notFound();

  const [payments, logs, shopName, costMap, expenses] = await Promise.all([
    Payment.find({ order: o._id }).setOptions({ showVoided: true }).sort({ date: -1, createdAt: -1 }).populate("createdBy", "name").lean(),
    AuditLog.find({ collectionName: "orders", recordId: o._id }).sort({ timestamp: -1, _id: -1 }).lean(),
    getShopName(),
    costsByOrder([o._id]),
    Expense.find({ order: o._id, status: { $in: ["approved", "pending_approval"] } }).sort({ date: -1, createdAt: -1 }).lean(), // voided and rejected are left out
  ]);
  const costs = costMap.get(String(o._id));
  const pl = orderProfit(o, costs.cost);

  const writer = WRITER_ROLES.includes(user.role);
  const balance = o.netAmount - o.advanceReceived;
  const delivery = deliveryInfo(o.deliveryDate, o.status);
  const canReceive = writer && balance > 0 && o.status !== "cancelled";
  const share = whatsappLink(o.customerPhone, buildOrderMessage(shopName, o));
  const history = logs.map((l) => ({
    id: String(l._id),
    action: l.action,
    userName: l.userName || "",
    timestamp: l.timestamp.toISOString(),
    oldValue: l.oldValue ?? null,
    newValue: l.newValue ?? null,
  }));

  return (
    <div className="space-y-4">
      {sp.notice === "advance" && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The order was saved, but its advance payment was not recorded. Use &quot;Receive Payment&quot; below to add it.
        </p>
      )}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">{o.orderNo}</p>
            <h2 className="break-words text-xl font-bold text-slate-900">{o.customerName}</h2>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {o.customerPhone && (
            <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-blue-900">
              <Phone size={16} />
              {o.customerPhone}
            </a>
          )}
          {o.address && <p className="break-words">{o.address}</p>}
        </div>
        {o.isBackdated && (
          <div className="mt-2">
            <StatusBadge status="backdated" label="Backdated" />
          </div>
        )}
      </Card>

      <Card title="Items">
        <ul className="divide-y divide-slate-100">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-slate-900">{it.name}</p>
                <p className="text-xs text-slate-500">
                  {it.qty} × <MoneyText amount={it.rate} className="!font-normal !text-slate-500" />
                </p>
              </div>
              <MoneyText amount={it.total} />
            </li>
          ))}
        </ul>
      </Card>

      {o.photos?.length > 0 && (
        <Card title="Furniture photos">
          <ul className="grid grid-cols-3 gap-2">
            {o.photos.map((url, i) => (
              <li key={url} className="aspect-square overflow-hidden rounded-xl bg-slate-100">
                <a href={url} target="_blank" rel="noopener" aria-label={`Open photo ${i + 1} full size`} className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(url)} alt={`Furniture photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-center text-xs text-slate-500">Tap a photo to open it full size</p>
        </Card>
      )}

      <Card title="Profit / loss on this order">
        <dl className="divide-y divide-slate-100">
          <Row label={pl.cancelled ? "Kept from the cancelled order" : "Order value"}><MoneyText amount={pl.revenue} /></Row>
          <Row label={`Expenses for this order (${costs.costCount})`}><MoneyText amount={pl.cost} type="out" /></Row>
        </dl>
        <div className={`mt-2 flex items-center justify-between rounded-xl px-3 py-3 ${pl.profit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
          <span className="font-semibold text-slate-900">{pl.profit >= 0 ? "Profit" : "Loss"}</span>
          <span className="text-right">
            <MoneyText amount={Math.abs(pl.profit)} type={pl.profit >= 0 ? "in" : "out"} className="text-xl" />
            {pl.margin !== null && <span className="block text-xs text-slate-500">{Math.round(pl.margin * 100)}% of the order value</span>}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Received so far {formatPKR(o.advanceReceived)}, so {formatPKR(Math.abs(pl.inHand))} {pl.inHand >= 0 ? "is in hand after" : "is still to recover for"} these expenses.
        </p>
        {costs.pendingCount > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {formatPKR(costs.pending)} ({costs.pendingCount}) waiting for the owner&apos;s approval is not counted yet.
          </p>
        )}
        {expenses.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {expenses.map((x) => {
              const { label, icon: Icon } = CATEGORY_META[x.category] ?? { label: x.category, icon: CATEGORY_META.misc.icon };
              return (
                <li key={String(x._id)}>
                  <Link href={`/expenses/${x._id}`} className="flex min-h-14 items-center gap-3 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{x.paidTo || label}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {label} · {formatDate(x.date)}
                        {x.status === "pending_approval" && " · waiting for approval"}
                      </span>
                    </span>
                    <MoneyText amount={x.amount} type="out" className={x.status === "pending_approval" ? "opacity-60" : ""} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {writer && (
          <Link href={`/expenses/new?order=${id}`} className={`${btnGhost} mt-3 min-h-12 w-full`}>
            <Plus size={18} />
            Add expense for this order
          </Link>
        )}
      </Card>

      <Card title="Balance summary">
        <dl className="divide-y divide-slate-100">
          <Row label="Total"><MoneyText amount={o.totalAmount} /></Row>
          {o.discount > 0 && <Row label="Discount"><MoneyText amount={o.discount} type="out" sign /></Row>}
          <Row label="Net amount"><MoneyText amount={o.netAmount} /></Row>
          <Row label="Received"><MoneyText amount={o.advanceReceived} type="in" /></Row>
        </dl>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
          <span className="font-semibold text-slate-900">Balance</span>
          {balance > 0 ? <MoneyText amount={balance} type="out" className="text-xl" /> : <span className="text-xl font-bold text-green-600">Paid in full</span>}
        </div>
      </Card>

      <Card title="Details">
        <dl className="divide-y divide-slate-100">
          <Row label="Order date">{formatDate(o.orderDate)}</Row>
          <Row label="Delivery">{delivery ? <span className={delivery.className}>{delivery.text}</span> : "—"}</Row>
          <Row label="Entered by">
            {o.createdBy?.name || "Unknown"}
            <span className="block text-xs font-normal text-slate-500">{formatDateTime(o.createdAt)}</span>
          </Row>
          {o.notes && <Row label="Notes"><span className="break-words">{o.notes}</span></Row>}
        </dl>
      </Card>

      {writer && o.status !== "delivered" && (
        <Card title="Order status">
          <OrderStatusActions id={id} status={o.status} balance={balance} received={o.advanceReceived} />
        </Card>
      )}

      <div className="space-y-2">
        {canReceive && (
          <Link href={`/payments/new?order=${id}`} className={`${btnPrimary} min-h-12 w-full`}>
            <HandCoins size={20} />
            Receive Payment
          </Link>
        )}
        <a href={share} target="_blank" rel="noopener noreferrer" className={`${btnGhost} min-h-12 w-full !border-green-600 !text-green-700`}>
          <MessageCircle size={20} />
          Share on WhatsApp
        </a>
        <Link href={`/orders/${id}/invoice`} className={`${btnGhost} min-h-12 w-full`}>
          <FileText size={20} />
          Invoice / Print
        </Link>
      </div>

      <Card title="Payments received">
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={String(p._id)}>
                <Link href={`/payments/${p._id}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {PAYMENT_TYPE_LABELS[p.type]} · {METHOD_LABELS[p.method]}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {formatDate(p.date)} · by {p.createdBy?.name || "Unknown"}
                    </p>
                    {p.isVoided && <StatusBadge status="voided" className="mt-1" />}
                  </div>
                  <MoneyText amount={p.amount} type="in" className={p.isVoided ? "line-through opacity-60" : ""} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="History">
        <AuditHistory entries={history} />
      </Card>
    </div>
  );
}
