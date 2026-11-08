import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { Info, Lock, Pencil } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import AuditHistory from "@/components/AuditHistory";
import { requirePageUser } from "@/lib/auth-helpers";
import { isDayLocked } from "@/lib/audit";
import connectDB from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/constants";
import { EXPENSE_SOURCES } from "@/lib/expense-sources";
import { formatPKR } from "@/lib/format";
import { CATEGORY_META } from "@/lib/expense-meta";
import { WRITER_ROLES } from "@/lib/nav";
import { btnPrimary } from "@/lib/ui";
import AuditLog from "@/models/AuditLog";
import Expense from "@/models/Expense";
import VoidExpenseButton from "../VoidExpenseButton";

export const metadata = { title: "Expense" };

const name = (u) => u?.name || "Unknown";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function ExpenseDetailPage({ params }) {
  const { id } = await params;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const e = await Expense.findById(id)
    .setOptions({ showVoided: true })
    .populate("createdBy updatedBy approvedBy rejectedBy voidedBy", "name")
    .populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } })
    .lean();
  if (!e) notFound();

  const writer = WRITER_ROLES.includes(user.role);
  // Managers can't change anything on a day that has a locked daily closing; the admin can.
  const locked = writer && user.role !== "admin" ? await isDayLocked(e.date) : false;
  const auto = Boolean(e.sourceType); // made by a staff advance / salary payment
  const canChange = writer && !e.isVoided && !locked && !auto;

  const logs = await AuditLog.find({ collectionName: "expenses", recordId: e._id }).sort({ timestamp: -1, _id: -1 }).lean();
  const history = logs.map((l) => ({
    id: String(l._id),
    action: l.action,
    userName: l.userName || "",
    timestamp: l.timestamp.toISOString(),
    oldValue: l.oldValue ?? null,
    newValue: l.newValue ?? null,
  }));

  const { label, icon: Icon } = CATEGORY_META[e.category] ?? { label: e.category, icon: CATEGORY_META.misc.icon };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Icon size={24} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{label}</p>
            <p className="text-sm text-slate-500">{formatDate(e.date)}</p>
          </div>
        </div>
        <p className="mt-3 text-3xl">
          <MoneyText amount={e.amount} type="out" className={e.isVoided ? "line-through opacity-60" : ""} />
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {e.isVoided && <StatusBadge status="voided" />}
          {e.status === "pending_approval" && <StatusBadge status="pending_approval" />}
          {e.status === "rejected" && <StatusBadge status="rejected" />}
          {e.status === "approved" && !e.isVoided && <StatusBadge status="approved" />}
          {e.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
        </div>
      </Card>

      <Card title="Details">
        <dl className="divide-y divide-slate-100">
          <Row label="Paid to">{e.paidTo || "—"}</Row>
          <Row label="Paid by">{METHOD_LABELS[e.method] || e.method}</Row>
          {e.order && (
            <Row label="For order">
              <Link href={`/orders/${e.order._id}`} className="font-semibold text-blue-900 underline">
                {e.order.orderNo}
              </Link>
              <span className="block text-xs font-normal text-slate-500">{e.order.customerName}</span>
            </Row>
          )}
          <Row label="Note">{e.note || "—"}</Row>
          <Row label="Entered by">
            {name(e.createdBy)}
            <span className="block text-xs font-normal text-slate-500">{formatDateTime(e.createdAt)}</span>
          </Row>
          {e.updatedBy && String(e.updatedAt) !== String(e.createdAt) && (
            <Row label="Last edited by">
              {name(e.updatedBy)}
              <span className="block text-xs font-normal text-slate-500">{formatDateTime(e.updatedAt)}</span>
            </Row>
          )}
          {e.approvedBy && (
            <Row label="Approved by">
              {name(e.approvedBy)}
              {e.approvedAt && <span className="block text-xs font-normal text-slate-500">{formatDateTime(e.approvedAt)}</span>}
            </Row>
          )}
        </dl>
      </Card>

      {e.status === "pending_approval" && !e.isVoided && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info size={18} className="mt-0.5 shrink-0" />
          <span>
            Waiting for the owner&apos;s approval. It is not counted in any total until it is approved.
            {user.role === "admin" && (
              <>
                {" "}
                <Link href="/approvals" className="font-semibold underline">Go to Approvals</Link>
              </>
            )}
          </span>
        </p>
      )}

      {e.status === "rejected" && e.rejectReason && (
        <Card title="Rejected" className="border border-red-200 bg-red-50">
          <p className="text-sm text-red-800">{e.rejectReason}</p>
          <p className="mt-1 text-xs text-red-700">
            by {name(e.rejectedBy)}
            {e.rejectedAt && `, ${formatDateTime(e.rejectedAt)}`}
          </p>
          <p className="mt-2 text-xs text-red-700">Rejected expenses are never counted. A manager can edit it to send it for approval again.</p>
        </Card>
      )}

      {e.isVoided && (
        <Card title="Voided" className="border border-red-200 bg-red-50">
          <p className="text-sm text-red-800">{e.voidReason}</p>
          <p className="mt-1 text-xs text-red-700">
            by {name(e.voidedBy)}
            {e.voidedAt && `, ${formatDateTime(e.voidedAt)}`}
          </p>
        </Card>
      )}

      {e.receiptUrl && (
        <Card title="Receipt">
          <a href={e.receiptUrl} target="_blank" rel="noopener" aria-label="Open the receipt full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.receiptUrl} alt="Receipt" className="max-h-[70dvh] w-full rounded-xl bg-slate-100 object-contain" />
          </a>
          <p className="mt-2 text-center text-xs text-slate-500">Tap the photo to open it full size</p>
        </Card>
      )}

      {auto && !e.isVoided && (
        <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <Info size={18} className="mt-0.5 shrink-0" />
          {`Created automatically by ${EXPENSE_SOURCES[e.sourceType]?.what || "another record"}. To correct it, ${EXPENSE_SOURCES[e.sourceType]?.fix || "void that record"}.`}
        </p>
      )}

      {writer && !e.isVoided && !auto && (
        <div className="space-y-3">
          {locked && (
            <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
              <Lock size={18} className="mt-0.5 shrink-0" />
              This day is closed (locked daily closing). Only the owner can edit or void this expense.
            </p>
          )}
          {canChange && (
            <>
              <Link href={`/expenses/${id}/edit`} className={`${btnPrimary} min-h-12 w-full`}>
                <Pencil size={18} />
                Edit expense
              </Link>
              <VoidExpenseButton id={id} summary={`${label}, ${formatPKR(e.amount)}`} />
            </>
          )}
        </div>
      )}

      <Card title="History">
        <AuditHistory entries={history} />
      </Card>
    </div>
  );
}
