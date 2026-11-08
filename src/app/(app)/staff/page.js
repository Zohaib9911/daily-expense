import Link from "next/link";
import { CalendarCheck, FileSpreadsheet, HandCoins, Plus, UserPlus, Users, Wallet } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { outstandingByStaff } from "@/lib/staff-money";
import { btnPrimary } from "@/lib/ui";
import Staff from "@/models/Staff";

export const metadata = { title: "Staff & Salary" };

function Tile({ href, icon: Icon, children }) {
  return (
    <Link href={href} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white p-2 text-center text-xs font-semibold text-slate-800 shadow-sm active:bg-slate-50">
      <Icon size={22} className="text-blue-900" />
      {children}
    </Link>
  );
}

export default async function StaffPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const showInactive = (Array.isArray(sp.inactive) ? sp.inactive[0] : sp.inactive) === "1";
  const writer = WRITER_ROLES.includes(user.role);

  await connectDB();
  const [staff, owed] = await Promise.all([
    Staff.find(showInactive ? {} : { active: true }).sort({ active: -1, name: 1 }).lean(),
    outstandingByStaff(),
  ]);
  const totalOwed = staff.reduce((s, m) => s + (owed.get(String(m._id)) || 0), 0);

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${writer ? "grid-cols-2" : "grid-cols-2"}`}>
        <Tile href="/staff/attendance" icon={CalendarCheck}>Attendance</Tile>
        <Tile href="/staff/salary-sheet" icon={FileSpreadsheet}>Salary sheet</Tile>
        {writer && <Tile href="/staff/salary/new" icon={HandCoins}>Pay salary</Tile>}
        {writer && <Tile href="/advances/new" icon={Wallet}>Give advance</Tile>}
      </div>

      {writer && (
        <Link href="/staff/new" className={`${btnPrimary} min-h-12 w-full`}>
          <UserPlus size={20} />
          Add staff
        </Link>
      )}

      {totalOwed > 0 && (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          Advances not yet recovered: <MoneyText amount={totalOwed} type="out" />
        </p>
      )}

      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description={writer ? "Add your first staff member to track attendance, advances and salary." : "No staff have been added."}
          action={writer ? <Link href="/staff/new" className={btnPrimary}><Plus size={18} />Add staff</Link> : null}
        />
      ) : (
        <ul className="space-y-3">
          {staff.map((m) => {
            const due = owed.get(String(m._id)) || 0;
            return (
              <li key={String(m._id)}>
                <Link href={`/staff/${m._id}`} className={`block min-w-0 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${m.active ? "" : "opacity-70"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{m.name}</p>
                      <p className="truncate text-sm text-slate-500">{m.role || "No role set"}</p>
                    </div>
                    {!m.active && <StatusBadge status="inactive" />}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{formatPKR(m.wageAmount)}</span> / {m.wageType === "daily" ? "day" : "month"}
                    </p>
                    {due > 0 ? (
                      <p className="text-right text-xs text-slate-500">
                        Advance due
                        <br />
                        <MoneyText amount={due} type="out" className="text-sm" />
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">No advance due</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center">
        <Link href={showInactive ? "/staff" : "/staff?inactive=1"} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-900">
          {showInactive ? "Hide inactive staff" : "Show inactive staff"}
        </Link>
      </p>
    </div>
  );
}
