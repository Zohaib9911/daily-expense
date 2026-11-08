import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, HandCoins, Pencil, Phone, Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import VoidRecordButton from "@/components/VoidRecordButton";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { dayKey, formatDate, todayKarachi } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { addMonths, currentMonth, monthLabel, monthRange, MONTH_RE } from "@/lib/salary";
import { outstandingByStaff } from "@/lib/staff-money";
import { btnGhost, btnPrimary } from "@/lib/ui";
import Attendance from "@/models/Attendance";
import SalaryPayment from "@/models/SalaryPayment";
import Staff from "@/models/Staff";
import StaffAdvance from "@/models/StaffAdvance";
import { voidAdvance } from "../../advances/actions";
import { voidSalary } from "../salary/actions";
import AttendanceCalendar from "../AttendanceCalendar";

export const metadata = { title: "Staff" };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function StaffProfilePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  const now = currentMonth();
  const month = MONTH_RE.test(one(sp.month)) && one(sp.month) <= now ? one(sp.month) : now;

  await connectDB();
  const s = await Staff.findById(id).lean();
  if (!s) notFound();

  const { start, end } = monthRange(month);
  const [marks, advances, salaries, owed] = await Promise.all([
    Attendance.find({ staff: s._id, date: { $gte: start, $lt: end } }).lean(),
    StaffAdvance.find({ staff: s._id }).setOptions({ showVoided: true }).sort({ date: -1, createdAt: -1 }).limit(20).lean(),
    SalaryPayment.find({ staff: s._id }).setOptions({ showVoided: true }).sort({ month: -1, date: -1 }).limit(24).lean(),
    outstandingByStaff([id]),
  ]);

  const days = {};
  const tally = { present: 0, half_day: 0, absent: 0 };
  for (const a of marks) {
    days[Number(dayKey(a.date).slice(8, 10))] = a.status;
    tally[a.status]++;
  }
  const joinKey = s.joinDate ? dayKey(s.joinDate) : null;
  const joinDay = joinKey && joinKey.slice(0, 7) === month ? Number(joinKey.slice(8, 10)) : 1;
  const lastDay = month === now ? Number(todayKarachi().slice(8, 10)) : undefined;
  const writer = WRITER_ROLES.includes(user.role);
  const due = owed.get(id) || 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-slate-900">{s.name}</h2>
            <p className="text-sm text-slate-500">{s.role || "No role set"}</p>
          </div>
          {!s.active && <StatusBadge status="inactive" />}
        </div>
        <dl className="mt-2 divide-y divide-slate-100">
          <Row label="Wage">
            <span className="font-semibold">{formatPKR(s.wageAmount)}</span> / {s.wageType === "daily" ? "day" : "month"}
          </Row>
          {s.phone && (
            <Row label="Phone">
              <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-blue-900">
                <Phone size={14} />
                {s.phone}
              </a>
            </Row>
          )}
          {s.cnic && <Row label="CNIC">{s.cnic}</Row>}
          <Row label="Joined">{s.joinDate ? formatDate(s.joinDate) : "—"}</Row>
          <Row label="Advance due">{due > 0 ? <MoneyText amount={due} type="out" /> : <span className="text-slate-500">None</span>}</Row>
        </dl>
      </Card>

      {writer && (
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/staff/salary/new?staff=${id}&month=${now}`} className={`${btnPrimary} min-h-12`}>
            <HandCoins size={18} />
            Pay salary
          </Link>
          <Link href={`/advances/new?staff=${id}`} className={`${btnGhost} min-h-12`}>
            <Wallet size={18} />
            Give advance
          </Link>
          <Link href={`/staff/${id}/edit`} className={`${btnGhost} col-span-2 min-h-12`}>
            <Pencil size={18} />
            Edit staff
          </Link>
        </div>
      )}

      <Card
        title="Attendance"
        action={
          <div className="flex items-center gap-1">
            <Link href={`/staff/${id}?month=${addMonths(month, -1)}`} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100">
              <ChevronLeft size={20} />
            </Link>
            {month < now ? (
              <Link href={`/staff/${id}?month=${addMonths(month, 1)}`} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100">
                <ChevronRight size={20} />
              </Link>
            ) : (
              <span className="h-11 w-11" />
            )}
          </div>
        }
      >
        <p className="mb-3 text-sm font-semibold text-slate-700">{monthLabel(month)}</p>
        <AttendanceCalendar month={month} days={days} joinDay={joinDay} lastDay={lastDay} />
        <p className="mt-3 text-sm text-slate-600">
          Present <b>{tally.present}</b> · Half day <b>{tally.half_day}</b> · Absent <b>{tally.absent}</b>
        </p>
        {writer && s.active && (
          <Link href="/staff/attendance" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-900">
            Mark attendance
          </Link>
        )}
      </Card>

      <Card title="Advances">
        {advances.length === 0 ? (
          <p className="text-sm text-slate-500">No advances.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {advances.map((a) => (
              <li key={String(a._id)} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{formatDate(a.date)} · {METHOD_LABELS[a.method] || "Cash"}</p>
                    {a.note && <p className="break-words text-xs text-slate-500">{a.note}</p>}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.isVoided ? null : a.isFullyRecovered ? "Fully recovered" : `Recovered ${formatPKR(a.recoveredAmount)}, due ${formatPKR(a.amount - a.recoveredAmount)}`}
                    </p>
                  </div>
                  <MoneyText amount={a.amount} type="out" className={a.isVoided ? "line-through opacity-60" : ""} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {a.isVoided && <StatusBadge status="voided" />}
                  {a.isBackdated && !a.isVoided && <StatusBadge status="backdated" label="Backdated" />}
                  {writer && !a.isVoided && (
                    <VoidRecordButton
                      action={voidAdvance} successMessage="Advance voided"
                      id={String(a._id)}
                      title="Void this advance?"
                      description={`${formatPKR(a.amount)} advance to ${s.name}. Its expense is voided too.`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Salary history">
        {salaries.length === 0 ? (
          <p className="text-sm text-slate-500">No salary payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {salaries.map((p) => (
              <li key={String(p._id)} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{monthLabel(p.month)}</p>
                    <p className="text-xs text-slate-500">
                      Paid {formatDate(p.date)} · {METHOD_LABELS[p.method] || "Cash"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Gross {formatPKR(p.grossAmount)}
                      {p.bonus > 0 && ` + bonus ${formatPKR(p.bonus)}`}
                      {p.advanceDeducted > 0 && ` − advance ${formatPKR(p.advanceDeducted)}`}
                      {p.otherDeduction > 0 && ` − other ${formatPKR(p.otherDeduction)}`}
                    </p>
                  </div>
                  <MoneyText amount={p.netPaid} type="out" className={p.isVoided ? "line-through opacity-60" : ""} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {p.isVoided && <StatusBadge status="voided" />}
                  {p.isBackdated && !p.isVoided && <StatusBadge status="backdated" label="Backdated" />}
                  {writer && !p.isVoided && (
                    <VoidRecordButton
                      action={voidSalary} successMessage="Salary payment voided"
                      id={String(p._id)}
                      title="Void this salary payment?"
                      description={`${monthLabel(p.month)} salary for ${s.name}. Deducted advances are given back and its expense is voided too.`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
