import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { addMonths, calcGross, currentMonth, monthLabel, MONTH_RE, recentMonths } from "@/lib/salary";
import { attendanceCounts } from "@/lib/staff-money";
import { btnPrimary, inputClass } from "@/lib/ui";
import SalaryPayment from "@/models/SalaryPayment";
import Staff from "@/models/Staff";

export const metadata = { title: "Salary sheet" };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
const th = "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500";
const td = "px-3 py-3 text-right text-sm tabular-nums";

export default async function SalarySheetPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const now = currentMonth();
  const month = MONTH_RE.test(one(sp.month)) && one(sp.month) <= now ? one(sp.month) : now;
  const months = recentMonths(24);

  await connectDB();
  const payments = await SalaryPayment.find({ month }).lean(); // voided payments are left out
  const paidIds = new Set(payments.map((p) => String(p.staff)));
  const staff = await Staff.find({ $or: [{ active: true }, { _id: { $in: [...paidIds] } }] }).sort({ name: 1 }).lean();
  const counts = await attendanceCounts(staff.map((s) => s._id), month);

  const rows = staff
    .map((s) => {
      const mine = payments.filter((p) => String(p.staff) === String(s._id));
      const c = counts.get(String(s._id)) ?? { present: 0, half: 0, absent: 0 };
      const calc = calcGross({ wageType: s.wageType, wageAmount: s.wageAmount, joinKey: s.joinDate ? dayKey(s.joinDate) : null, month, counts: c });
      if (mine.length) {
        const sum = (k) => mine.reduce((t, p) => t + p[k], 0);
        return { id: String(s._id), name: s.name, status: "paid", days: calc.daysWorked, gross: sum("grossAmount"), bonus: sum("bonus"), adv: sum("advanceDeducted"), other: sum("otherDeduction"), net: sum("netPaid") };
      }
      if (calc.notJoined) return null;
      return { id: String(s._id), name: s.name, status: "unpaid", days: calc.daysWorked, gross: calc.gross, bonus: 0, adv: 0, other: 0, net: calc.gross };
    })
    .filter(Boolean);

  const total = (k, status) => rows.filter((r) => !status || r.status === status).reduce((t, r) => t + r[k], 0);
  const writer = WRITER_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/staff/salary-sheet?month=${addMonths(month, -1)}`} aria-label="Previous month" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
            <ChevronLeft size={22} />
          </Link>
          <p className="min-w-0 truncate text-center font-semibold text-slate-900">{monthLabel(month)}</p>
          {month < now ? (
            <Link href={`/staff/salary-sheet?month=${addMonths(month, 1)}`} aria-label="Next month" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
              <ChevronRight size={22} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
        </div>
        <form method="get" className="flex gap-2">
          <select name="month" defaultValue={month} aria-label="Choose a month" className={`${inputClass} min-w-0 flex-1`}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button type="submit" className={`${btnPrimary} shrink-0`}>Go</button>
        </form>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Paid</dt>
            <dd><MoneyText amount={total("net", "paid")} type="out" /></dd>
          </div>
          <div>
            <dt className="text-slate-500">Still to pay (projected)</dt>
            <dd><MoneyText amount={total("net", "unpaid")} /></dd>
          </div>
        </dl>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No staff for this month" description="Add staff, or choose another month." />
      ) : (
        <>
          {/* The table scrolls sideways inside this box on a phone; the page itself never does. */}
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm" tabIndex={0} role="region" aria-label="Salary sheet table">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`${th} sticky left-0 bg-white text-left`}>Staff</th>
                  <th className={th}>Days</th>
                  <th className={th}>Gross</th>
                  <th className={th}>Bonus</th>
                  <th className={th}>Advance</th>
                  <th className={th}>Other</th>
                  <th className={th}>Net</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 max-w-40 truncate bg-white px-3 py-3 text-left text-sm font-semibold text-slate-900">
                      <Link href={`/staff/${r.id}?month=${month}`} className="hover:underline">{r.name}</Link>
                    </td>
                    <td className={td}>{r.days}</td>
                    <td className={td}>{formatPKR(r.gross)}</td>
                    <td className={`${td} text-green-600`}>{r.bonus ? formatPKR(r.bonus) : "–"}</td>
                    <td className={`${td} text-red-600`}>{r.adv ? formatPKR(r.adv) : "–"}</td>
                    <td className={`${td} text-red-600`}>{r.other ? formatPKR(r.other) : "–"}</td>
                    <td className={`${td} font-semibold`}>{formatPKR(r.net)}</td>
                    <td className="px-3 py-3 text-right text-sm">
                      {r.status === "paid" ? (
                        <span className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">Paid</span>
                      ) : writer ? (
                        <Link href={`/staff/salary/new?staff=${r.id}&month=${month}`} className="inline-flex min-h-11 items-center rounded-full bg-amber-50 px-3 text-xs font-semibold text-amber-700">Unpaid · Pay</Link>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Unpaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="sticky left-0 bg-slate-50 px-3 py-3 text-left text-sm">Total</td>
                  <td className={td} />
                  <td className={td}>{formatPKR(total("gross"))}</td>
                  <td className={td}>{formatPKR(total("bonus"))}</td>
                  <td className={td}>{formatPKR(total("adv"))}</td>
                  <td className={td}>{formatPKR(total("other"))}</td>
                  <td className={td}>{formatPKR(total("net"))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Paid rows show what was actually paid. Unpaid rows are projected from attendance (no deductions yet). Swipe the table sideways to see every column.
          </p>
        </>
      )}
    </div>
  );
}
