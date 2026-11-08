import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { dayKey, dayRange, formatDate, startOfDayKarachi, todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import Attendance from "@/models/Attendance";
import Staff from "@/models/Staff";
import AttendanceList from "./AttendanceList";

export const metadata = { title: "Attendance" };

const shift = (key, n) => dayKey(new Date(startOfDayKarachi(key).getTime() + n * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));

export default async function AttendancePage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const today = todayKarachi();
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw || "") && raw <= today ? raw : today;

  await connectDB();
  const { start, end } = dayRange(date);
  const [staff, marks] = await Promise.all([
    Staff.find({ active: true }).sort({ name: 1 }).lean(),
    Attendance.find({ date: { $gte: start, $lt: end } }).lean(),
  ]);
  const byStaff = new Map(marks.map((a) => [String(a.staff), a.status]));
  // Don't list people who hadn't joined yet on that date.
  const rows = staff
    .filter((s) => !s.joinDate || dayKey(s.joinDate) <= date)
    .map((s) => ({ id: String(s._id), name: s.name, role: s.role || "", status: byStaff.get(String(s._id)) || null }));

  const count = (st) => rows.filter((r) => r.status === st).length;
  const canEdit = WRITER_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/staff/attendance?date=${shift(date, -1)}`} aria-label="Previous day" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
            <ChevronLeft size={22} />
          </Link>
          <div className="min-w-0 text-center">
            <p className="font-semibold text-slate-900">{formatDate(start)}</p>
            <p className="text-xs text-slate-500">{date === today ? "Today" : "Past day"}</p>
          </div>
          {date < today ? (
            <Link href={`/staff/attendance?date=${shift(date, 1)}`} aria-label="Next day" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
              <ChevronRight size={22} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
        </div>
        <form method="get" className="flex gap-2">
          <input type="date" name="date" defaultValue={date} max={today} aria-label="Choose a date" className={`${inputClass} min-w-0 flex-1`} />
          <button type="submit" className={`${btnPrimary} shrink-0`}>Go</button>
          {date !== today && (
            <Link href="/staff/attendance" className={`${btnGhost} shrink-0`}>Today</Link>
          )}
        </form>
        <p className="text-sm text-slate-600">
          <b className="text-green-700">{count("present")}</b> present · <b className="text-amber-700">{count("half_day")}</b> half day · <b className="text-red-700">{count("absent")}</b> absent · <b>{rows.length - count("present") - count("half_day") - count("absent")}</b> not marked
        </p>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No staff to mark" description="Add staff first, or choose a later date." action={canEdit ? <Link href="/staff/new" className={btnPrimary}>Add staff</Link> : null} />
      ) : (
        // key: a different date or newly saved marks reset the row state from the server
        <AttendanceList key={`${date}-${marks.length}`} date={date} rows={rows} canEdit={canEdit} />
      )}
    </div>
  );
}
