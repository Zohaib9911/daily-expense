import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { Info, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import AuditHistory from "@/components/AuditHistory";
import VoidRecordButton from "@/components/VoidRecordButton";
import { requirePageUser } from "@/lib/auth-helpers";
import { isDayLocked } from "@/lib/audit";
import connectDB from "@/lib/db";
import { METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import AuditLog from "@/models/AuditLog";
import MaterialPurchase from "@/models/MaterialPurchase";
import { voidPurchase } from "../actions";

export const metadata = { title: "Purchase" };

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function PurchaseDetailPage({ params }) {
  const { id } = await params;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const p = await MaterialPurchase.findById(id).setOptions({ showVoided: true }).populate("supplier", "name").populate("createdBy voidedBy", "name").lean();
  if (!p) notFound();

  const writer = WRITER_ROLES.includes(user.role);
  const locked = writer && user.role !== "admin" ? await isDayLocked(p.date) : false;
  const logs = await AuditLog.find({ collectionName: "materialpurchases", recordId: p._id }).sort({ timestamp: -1, _id: -1 }).lean();
  const history = logs.map((l) => ({ id: String(l._id), action: l.action, userName: l.userName || "", timestamp: l.timestamp.toISOString(), oldValue: l.oldValue ?? null, newValue: l.newValue ?? null }));

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">{formatDate(p.date)}</p>
        <h2 className="break-words text-xl font-bold text-slate-900">
          <Link href={`/suppliers/${p.supplier?._id}`} className="hover:underline">{p.supplier?.name || "Unknown supplier"}</Link>
        </h2>
        <p className="mt-2 text-3xl"><MoneyText amount={p.totalAmount} type="out" className={p.isVoided ? "line-through opacity-60" : ""} /></p>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.isVoided && <StatusBadge status="voided" />}
          {p.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
        </div>
      </Card>

      <Card title="Items">
        <ul className="divide-y divide-slate-100">
          {p.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-slate-900">{it.name}</p>
                <p className="text-xs text-slate-500">{it.qty} {it.unit} × {formatPKR(it.rate)}</p>
              </div>
              <MoneyText amount={it.total} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Payment">
        <dl className="divide-y divide-slate-100">
          <Row label="Total"><MoneyText amount={p.totalAmount} /></Row>
          <Row label={`Paid now${p.paidAmount > 0 ? ` (${METHOD_LABELS[p.method] || "Cash"})` : ""}`}><MoneyText amount={p.paidAmount} type="in" /></Row>
          <Row label="Added to supplier due">{p.dueAmount > 0 ? <MoneyText amount={p.dueAmount} type="out" /> : "Rs 0"}</Row>
          {p.note && <Row label="Note">{p.note}</Row>}
          <Row label="Entered by">
            {p.createdBy?.name || "Unknown"}
            <span className="block text-xs font-normal text-slate-500">{formatDateTime(p.createdAt)}</span>
          </Row>
        </dl>
        {p.paidAmount > 0 && (
          <p className="mt-2 flex gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <Info size={14} className="mt-0.5 shrink-0" />
            The {formatPKR(p.paidAmount)} paid now is also recorded as a Raw Material expense.
          </p>
        )}
      </Card>

      {p.isVoided && (
        <Card title="Voided" className="border border-red-200 bg-red-50">
          <p className="text-sm text-red-800">{p.voidReason}</p>
          <p className="mt-1 text-xs text-red-700">by {p.voidedBy?.name || "Unknown"}{p.voidedAt && `, ${formatDateTime(p.voidedAt)}`}</p>
        </Card>
      )}

      {p.receiptUrl && (
        <Card title="Bill">
          <a href={p.receiptUrl} target="_blank" rel="noopener" aria-label="Open the bill full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.receiptUrl} alt="Bill" className="max-h-[70dvh] w-full rounded-xl bg-slate-100 object-contain" />
          </a>
        </Card>
      )}

      {writer && !p.isVoided &&
        (locked ? (
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <Lock size={18} className="mt-0.5 shrink-0" />
            This day is closed (locked daily closing). Only the owner can void this purchase.
          </p>
        ) : (
          <VoidRecordButton
            action={voidPurchase} successMessage="Purchase voided"
            id={id}
            label="Void purchase"
            className="w-full justify-center"
            title="Void this purchase?"
            description={`${formatPKR(p.totalAmount)} purchase from ${p.supplier?.name || "the supplier"}. The supplier's due is reduced and the payment expense (if any) is voided too.`}
          />
        ))}

      <Card title="History">
        <AuditHistory entries={history} />
      </Card>
    </div>
  );
}
