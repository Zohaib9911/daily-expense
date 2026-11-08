import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { HandCoins, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import AuditHistory from "@/components/AuditHistory";
import { requirePageUser } from "@/lib/auth-helpers";
import { isDayLocked } from "@/lib/audit";
import connectDB from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { METHOD_LABELS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import AuditLog from "@/models/AuditLog";
import Payment from "@/models/Payment";
import VoidPaymentButton from "../VoidPaymentButton";

export const metadata = { title: "Payment" };

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function PaymentDetailPage({ params }) {
  const { id } = await params;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const p = await Payment.findById(id)
    .setOptions({ showVoided: true })
    .populate("createdBy voidedBy", "name")
    .populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } })
    .lean();
  if (!p) notFound();

  const writer = WRITER_ROLES.includes(user.role);
  const locked = writer && user.role !== "admin" ? await isDayLocked(p.date) : false;
  const logs = await AuditLog.find({ collectionName: "payments", recordId: p._id }).sort({ timestamp: -1, _id: -1 }).lean();
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
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
            <HandCoins size={24} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{PAYMENT_TYPE_LABELS[p.type]}</p>
            <p className="text-sm text-slate-500">{formatDate(p.date)}</p>
          </div>
        </div>
        <p className="mt-3 text-3xl">
          <MoneyText amount={p.amount} type="in" className={p.isVoided ? "line-through opacity-60" : ""} />
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.isVoided && <StatusBadge status="voided" />}
          {p.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
        </div>
      </Card>

      <Card title="Details">
        <dl className="divide-y divide-slate-100">
          {p.order && (
            <Row label="Order">
              <Link href={`/orders/${p.order._id}`} className="text-blue-900 underline">
                {p.order.orderNo} · {p.order.customerName}
              </Link>
            </Row>
          )}
          <Row label="Received by">{METHOD_LABELS[p.method] || p.method}</Row>
          <Row label="Note">{p.note || "—"}</Row>
          <Row label="Entered by">
            {p.createdBy?.name || "Unknown"}
            <span className="block text-xs font-normal text-slate-500">{formatDateTime(p.createdAt)}</span>
          </Row>
        </dl>
      </Card>

      {p.isVoided && (
        <Card title="Voided" className="border border-red-200 bg-red-50">
          <p className="text-sm text-red-800">{p.voidReason}</p>
          <p className="mt-1 text-xs text-red-700">
            by {p.voidedBy?.name || "Unknown"}
            {p.voidedAt && `, ${formatDateTime(p.voidedAt)}`}
          </p>
        </Card>
      )}

      {p.receiptUrl && (
        <Card title="Receipt">
          <a href={p.receiptUrl} target="_blank" rel="noopener" aria-label="Open the receipt full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.receiptUrl} alt="Receipt" className="max-h-[70dvh] w-full rounded-xl bg-slate-100 object-contain" />
          </a>
        </Card>
      )}

      {writer && !p.isVoided && (
        <div className="space-y-3">
          {locked ? (
            <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <Lock size={18} className="mt-0.5 shrink-0" />
              This day is closed (locked daily closing). Only the owner can void this payment.
            </p>
          ) : (
            <VoidPaymentButton id={id} summary={`${PAYMENT_TYPE_LABELS[p.type]}, ${formatPKR(p.amount)}`} hasOrder={Boolean(p.order)} />
          )}
        </div>
      )}

      <Card title="History">
        <AuditHistory entries={history} />
      </Card>
    </div>
  );
}
