import Link from "next/link";
import { CheckCircle2, Info, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { METHOD_LABELS } from "@/lib/constants";
import { dayKey, formatDate, formatDateTime } from "@/lib/dates";
import { CATEGORY_META } from "@/lib/expense-meta";
import { EXPENSE_SOURCES } from "@/lib/expense-sources";
import { formatPKR } from "@/lib/format";
import { thumbUrl } from "@/lib/validation/expense";
import DailyClosing from "@/models/DailyClosing";
import Expense from "@/models/Expense";
import ApprovalActions from "./ApprovalActions";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  await requirePageRole(["admin"]);
  await connectDB();

  const [pending, locked] = await Promise.all([
    Expense.find({ status: "pending_approval" }).sort({ createdAt: 1 }).populate("createdBy", "name").lean(),
    DailyClosing.find({ isLocked: true }).select("date").lean(),
  ]);
  const lockedDays = new Set(locked.map((c) => dayKey(c.date)));
  const total = pending.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Waiting for your approval</p>
        <p className="text-3xl font-bold text-amber-700">{pending.length}</p>
        <p className="mt-1 text-sm text-slate-500">
          {pending.length > 0 ? (
            <>
              {formatPKR(total)} in total. These are <b>not counted</b> in any total until you approve them.
            </>
          ) : (
            "Expenses above your approval limit appear here."
          )}
        </p>
      </Card>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 text-center shadow-sm">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 size={28} />
          </span>
          <h2 className="text-base font-semibold text-slate-900">All caught up</h2>
          <p className="mt-1 max-w-xs text-sm text-slate-500">Nothing is waiting for approval.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((e) => {
            const { label, icon: Icon } = CATEGORY_META[e.category] ?? { label: e.category, icon: CATEGORY_META.misc.icon };
            const src = e.sourceType ? EXPENSE_SOURCES[e.sourceType] : null;
            const closedDay = lockedDays.has(dayKey(e.date));
            return (
              <li key={String(e._id)} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold text-slate-900">{label}</p>
                      <MoneyText amount={e.amount} type="out" className="text-lg" />
                    </div>
                    {e.paidTo && <p className="truncate text-sm text-slate-600">To {e.paidTo}</p>}
                    <p className="text-xs text-slate-500">
                      {formatDate(e.date)} · {METHOD_LABELS[e.method] || e.method}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Entered by</dt>
                    <dd className="font-medium text-slate-900">{e.createdBy?.name || "Unknown"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">When</dt>
                    <dd className="text-right text-slate-900">{formatDateTime(e.createdAt)}</dd>
                  </div>
                  {e.note && (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">Note</dt>
                      <dd className="min-w-0 break-words text-right text-slate-900">{e.note}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.isBackdated && <StatusBadge status="backdated" label="Backdated" />}
                </div>

                {e.receiptUrl ? (
                  <a href={e.receiptUrl} target="_blank" rel="noopener" className="mt-3 block" aria-label="Open the receipt full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbUrl(e.receiptUrl)} alt="Receipt" loading="lazy" className="h-28 w-full rounded-xl bg-slate-100 object-cover" />
                    <span className="mt-1 block text-center text-xs text-slate-500">Tap to open the receipt</span>
                  </a>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No receipt photo attached.</p>
                )}

                {closedDay && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
                    <Lock size={14} className="mt-0.5 shrink-0" />
                    This day is already closed. Approving adds it to the books, but the closing&apos;s counted figures won&apos;t change.
                  </p>
                )}
                {src && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    Created automatically by {src.what}. To decline it, {src.fix}.
                  </p>
                )}

                <div className="mt-4">
                  <ApprovalActions id={String(e._id)} summary={`${label}, ${formatPKR(e.amount)}${e.paidTo ? ` to ${e.paidTo}` : ""}`} canReject={!src} />
                </div>
                <Link href={`/expenses/${e._id}`} className="mt-2 flex min-h-11 items-center justify-center text-sm font-semibold text-blue-900">
                  View full details and history
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
