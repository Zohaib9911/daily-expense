import Link from "next/link";
import mongoose from "mongoose";
import { Info } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatDate, todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { currentMonth, MONTH_RE, monthLabel, recentMonths } from "@/lib/salary";
import { outstandingAdvances, salaryFigures } from "@/lib/staff-money";
import Staff from "@/models/Staff";
import SalaryForm from "../SalaryForm";
import SalarySelector from "../SalarySelector";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Pay salary" };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

function Line({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function PaySalaryPage({ searchParams }) {
  const user = await requirePageRole(WRITER_ROLES);
  const sp = await searchParams;
  const now = currentMonth();
  const months = recentMonths(12);
  const month = MONTH_RE.test(one(sp.month)) && months.some((m) => m.value === one(sp.month)) ? one(sp.month) : now;
  const staffId = mongoose.isValidObjectId(one(sp.staff)) ? one(sp.staff) : "";

  await connectDB();
  const staffDocs = await Staff.find({ active: true }).sort({ name: 1 }).lean();
  const staffList = staffDocs.map((s) => ({ id: String(s._id), name: s.name, role: s.role || "" }));
  const chosen = staffId ? await Staff.findById(staffId).lean() : null;

  let detail = null;
  if (chosen) {
    const [fig, advances] = await Promise.all([salaryFigures(chosen, month), outstandingAdvances(chosen._id)]);
    detail = { fig, advances, outstanding: advances.reduce((s, a) => s + a.outstanding, 0) };
  }

  const fig = detail?.fig;
  const daily = chosen?.wageType === "daily";
  const marked = fig ? fig.counts.present + fig.counts.half + fig.counts.absent : 0;
  const unmarked = fig ? Math.max(0, fig.periodDays - marked) : 0;
  const alreadyPaid = fig && fig.paidCount > 0;
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-4">
      <Card>
        <SalarySelector staff={staffList} months={months} staffId={chosen ? staffId : ""} month={month} />
      </Card>

      {chosen && fig && (
        <>
          <Card title={`${chosen.name} · ${monthLabel(month)}`}>
            {fig.notJoined ? (
              <p className="text-sm text-slate-600">{chosen.name} had not joined by {monthLabel(month)}, so there is no salary to pay.</p>
            ) : (
              <>
                <dl className="divide-y divide-slate-100">
                  <Line label="Wage">{formatPKR(chosen.wageAmount)} / {daily ? "day" : "month"}</Line>
                  <Line label="Present">{fig.counts.present} {fig.counts.present === 1 ? "day" : "days"}</Line>
                  <Line label="Half days">{fig.counts.half}</Line>
                  <Line label="Absent">{fig.counts.absent}</Line>
                  <Line label="Not marked">{unmarked}</Line>
                  <Line label="Days worked">{fig.daysWorked}</Line>
                </dl>
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {daily
                    ? `${formatPKR(chosen.wageAmount)} × ${fig.daysWorked} days. Only days marked present or half day are paid.`
                    : `${formatPKR(chosen.wageAmount)} ÷ ${fig.daysInMonth} days × ${fig.daysWorked} days. Absent days (and half a day per half day) are deducted; days with no attendance mark count as worked.`}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-slate-900">Gross salary</span>
                  <MoneyText amount={fig.gross} className="text-xl" />
                </div>
                {unmarked > 0 && (
                  <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <Info size={18} className="mt-0.5 shrink-0" />
                    {unmarked} {unmarked === 1 ? "day has" : "days have"} no attendance mark.{" "}
                    <Link href="/staff/attendance" className="font-semibold underline">Mark attendance</Link> first if it is incomplete.
                  </p>
                )}
              </>
            )}
          </Card>

          {alreadyPaid && (
            <Card title="Already paid this month" className="border border-amber-200 bg-amber-50">
              <ul className="space-y-1 text-sm text-amber-900">
                {fig.payments.map((p) => (
                  <li key={String(p._id)} className="flex justify-between gap-3">
                    <span>{formatPKR(p.netPaid)} net on {formatDate(p.date)}</span>
                    <span>gross {formatPKR(p.grossAmount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-amber-900">
                {isAdmin
                  ? fig.remainingGross > 0
                    ? `A new payment would add the unpaid gross of ${formatPKR(fig.remainingGross)} plus any bonus.`
                    : "The full gross is already paid. A new payment can only add a bonus."
                  : "A month can only be paid once. Ask the owner if it has to be paid again."}
              </p>
            </Card>
          )}

          {!fig.notJoined && (!alreadyPaid || isAdmin) && (
            <>
              {detail.advances.length > 0 && (
                <Card title="Outstanding advances">
                  <ul className="divide-y divide-slate-100 text-sm">
                    {detail.advances.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-slate-600">{formatDate(a.date)}{a.note ? ` · ${a.note}` : ""}</span>
                        <MoneyText amount={a.outstanding} type="out" />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Total outstanding: {formatPKR(detail.outstanding)}</p>
                </Card>
              )}
              <FreshOnVisit resetKey={`${staffId}-${month}`}><SalaryForm
                key={`${staffId}-${month}`}
                staffId={staffId}
                month={month}
                gross={fig.remainingGross}
                outstanding={detail.outstanding}
                today={todayKarachi()}
                mustOverride={Boolean(alreadyPaid)}
              /></FreshOnVisit>
            </>
          )}
        </>
      )}
    </div>
  );
}
