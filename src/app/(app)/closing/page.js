import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, History, Info, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { closingOn, dayFigures, openingFor } from "@/lib/closing";
import { dayKey, dayRange, formatDate, formatDateTime, startOfDayKarachi, todayKarachi } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import User from "@/models/User";
import CloseDayForm from "./CloseDayForm";
import DayBreakdown from "./DayBreakdown";
import UnlockDayButton from "./UnlockDayButton";

export const metadata = { title: "Daily closing" };

const shift = (key, n) => dayKey(new Date(startOfDayKarachi(key).getTime() + n * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));

function Line({ label, children, strong }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${strong ? "font-semibold" : ""}`}>
      <span className={`text-sm ${strong ? "text-slate-900" : "text-slate-600"}`}>{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export default async function ClosingPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const today = todayKarachi();
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw || "") && raw <= today ? raw : today;

  await connectDB();
  const [closing, fig, opening] = await Promise.all([closingOn(date), dayFigures(date), openingFor(date)]);
  const closed = Boolean(closing?.isLocked);
  const writer = WRITER_ROLES.includes(user.role);
  const isAdmin = user.role === "admin";

  const people = closing ? await User.find({ _id: { $in: [closing.closedBy, closing.unlockedBy].filter(Boolean) } }).select("name").lean() : [];
  const nameOf = (id) => people.find((p) => String(p._id) === String(id))?.name || "Unknown";

  // What to show in the cash-drawer card: stored figures once closed, live ones otherwise.
  const openingValue = closed ? closing.openingBalance : opening.value;
  const cashIn = closed ? closing.totalIn : fig.cashIn;
  const cashOut = closed ? closing.totalOut : fig.cashOut;
  const expected = openingValue + cashIn - cashOut;
  const label = formatDate(dayRange(date).start);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/closing?date=${shift(date, -1)}`} aria-label="Previous day" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
            <ChevronLeft size={22} />
          </Link>
          <div className="min-w-0 text-center">
            <p className="font-semibold text-slate-900">{label}</p>
            <p className="text-xs text-slate-500">{date === today ? "Today" : "Past day"}</p>
          </div>
          {date < today ? (
            <Link href={`/closing?date=${shift(date, 1)}`} aria-label="Next day" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
              <ChevronRight size={22} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
        </div>
        <form method="get" className="flex gap-2">
          <input type="date" name="date" defaultValue={date} max={today} aria-label="Choose a day" className={`${inputClass} min-w-0 flex-1`} />
          <button type="submit" className={`${btnPrimary} shrink-0`}>Go</button>
          {date !== today && <Link href="/closing" className={`${btnGhost} shrink-0`}>Today</Link>}
        </form>
        <Link href="/closing/history" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-900">
          <History size={16} />
          All closings and missing days
        </Link>
      </Card>

      {closed ? (
        <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <Lock size={18} className="mt-0.5 shrink-0" />
          This day is closed and locked. Managers can&apos;t add, change or void entries dated on it.
        </p>
      ) : (
        opening.kind === "previous" &&
        opening.gapDays > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>
              {opening.gapDays} {opening.gapDays === 1 ? "day" : "days"} since the last closing ({formatDate(dayRange(opening.prevKey).start)}) {opening.gapDays === 1 ? "was" : "were"} never closed.{" "}
              <Link href="/closing/history" className="font-semibold underline">See which</Link>
            </span>
          </p>
        )
      )}

      <Card title="Cash drawer">
        <div className="divide-y divide-slate-100">
          <Line label="Opening cash">
            <span className="font-semibold">{formatPKR(openingValue)}</span>
          </Line>
          {!closed && opening.kind === "previous" && (
            <p className="pb-2 text-xs text-slate-500">
              Counted on {formatDate(dayRange(opening.prevKey).start)}: {formatPKR(opening.counted)}
              {opening.moved !== 0 && `, ${opening.moved > 0 ? "plus" : "minus"} ${formatPKR(Math.abs(opening.moved))} cash movement on days that weren't closed`}.
            </p>
          )}
          {!closed && opening.kind === "first" && (
            <p className="pb-2 text-xs text-slate-500">
              This is the first closing. The opening cash comes from Settings ({formatPKR(opening.value)}).{" "}
              {isAdmin ? "You can change it below if it is wrong." : "Only the owner can change it."}
            </p>
          )}
          <Line label="Cash in (payments received)">
            <MoneyText amount={cashIn} type="in" sign />
          </Line>
          <Line label="Cash out (approved expenses)">
            <MoneyText amount={cashOut} type="out" sign />
          </Line>
          <Line label="Expected cash" strong>
            <MoneyText amount={expected} className="text-lg" />
          </Line>
        </div>
        {!closed && fig.pendingCashCount > 0 && (
          <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Info size={18} className="mt-0.5 shrink-0" />
            <span>
              {fig.pendingCashCount} cash {fig.pendingCashCount === 1 ? "expense" : "expenses"} ({formatPKR(fig.pendingCashOut)}) {fig.pendingCashCount === 1 ? "is" : "are"} still waiting for approval and {fig.pendingCashCount === 1 ? "isn't" : "aren't"} counted. If that cash already left the drawer, expect a difference of that amount.
            </span>
          </p>
        )}
      </Card>

      {closed ? (
        <Card title="Result">
          <div className={`rounded-2xl px-4 py-5 text-center ${closing.difference === 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className="text-sm font-medium text-slate-600">Difference</p>
            <p className={`text-4xl font-extrabold tabular-nums ${closing.difference === 0 ? "text-green-600" : "text-red-600"}`}>
              {closing.difference === 0 ? "Rs 0" : `${closing.difference > 0 ? "+" : "-"}${formatPKR(Math.abs(closing.difference))}`}
            </p>
            <p className="mt-1 text-sm text-slate-600">{closing.difference === 0 ? "Cash matched" : closing.difference > 0 ? "More cash than expected" : "Less cash than expected"}</p>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            <Line label="Cash counted"><span className="font-semibold">{formatPKR(closing.actualCounted)}</span></Line>
            {closing.note && <Line label="Note"><span className="break-words">{closing.note}</span></Line>}
            <Line label="Closed by">
              {nameOf(closing.closedBy)}
              <span className="block text-xs text-slate-500">{formatDateTime(closing.updatedAt)}</span>
            </Line>
          </div>
          {isAdmin && (
            <div className="mt-3">
              <UnlockDayButton id={String(closing._id)} dateLabel={label} />
            </div>
          )}
        </Card>
      ) : (
        <>
          {closing?.unlockReason && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info size={18} className="mt-0.5 shrink-0" />
              <span>
                This day was unlocked by {nameOf(closing.unlockedBy)}: &quot;{closing.unlockReason}&quot;. Close it again when the entries are right.
              </span>
            </p>
          )}
          {writer ? (
            <CloseDayForm
              key={date} /* same form instance when figures refresh, so the typed count and any message are kept */
              date={date}
              openingValue={openingValue}
              canEditOpening={isAdmin && opening.kind === "first"}
              cashIn={cashIn}
              cashOut={cashOut}
            />
          ) : (
            <Card>
              <p className="text-sm text-slate-600">This day has not been closed yet.</p>
            </Card>
          )}
        </>
      )}

      <Card title="Not in the cash drawer">
        <p className="mb-2 text-xs text-slate-500">Bank, JazzCash and EasyPaisa money is shown separately and isn&apos;t counted in the drawer.</p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-right font-semibold">In</th>
                <th className="px-3 py-2 text-right font-semibold">Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(fig.other).map(([m, v]) => (
                <tr key={m}>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{METHOD_LABELS[m]}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-600">{formatPKR(v.in)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{formatPKR(v.out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DayBreakdown dateKey={date} />
    </div>
  );
}
