import Link from "next/link";
import { AlertTriangle, CalendarCheck, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { eachDay } from "@/lib/closing";
import { dayKey, dayRange, formatDate, todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { addMonths, currentMonth, monthLabel, MONTH_RE, monthRange } from "@/lib/salary";
import DailyClosing from "@/models/DailyClosing";

export const metadata = { title: "Closing history" };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
const signed = (n) => (n === 0 ? "Rs 0" : `${n > 0 ? "+" : "-"}${formatPKR(Math.abs(n))}`);

export default async function ClosingHistoryPage({ searchParams }) {
  await requirePageUser();
  const sp = await searchParams;
  const today = todayKarachi();
  const now = currentMonth();

  await connectDB();
  const first = await DailyClosing.findOne({}).sort({ date: 1 }).lean();
  if (!first) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No closings yet"
        description="Close your first day from the Daily Closing screen. From then on, days without a closing show up here as warnings."
        action={
          <Link href="/closing" className="inline-flex min-h-12 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">
            Go to today&apos;s closing
          </Link>
        }
      />
    );
  }
  const firstKey = dayKey(first.date);
  const firstMonth = firstKey.slice(0, 7);

  let month = MONTH_RE.test(one(sp.month)) ? one(sp.month) : now;
  if (month > now) month = now;
  if (month < firstMonth) month = firstMonth;

  const { start, end } = monthRange(month);
  const closings = await DailyClosing.find({ date: { $gte: start, $lt: end } }).lean(); // voided ones left out
  const byDay = new Map(closings.map((c) => [dayKey(c.date), c]));

  const from = firstKey > `${month}-01` ? firstKey : `${month}-01`;
  const monthEndKey = dayKey(new Date(end.getTime() - 1));
  const to = monthEndKey < today ? monthEndKey : today;
  const days = from <= to ? eachDay(from, to).reverse() : [];

  const rows = days.map((key) => {
    const c = byDay.get(key);
    if (c?.isLocked) return { key, kind: "closed", c };
    if (c) return { key, kind: "reopened", c };
    return { key, kind: key === today ? "today" : "missing" };
  });
  const closed = rows.filter((r) => r.kind === "closed");
  const mismatches = closed.filter((r) => r.c.difference !== 0);
  const missing = rows.filter((r) => r.kind === "missing" || r.kind === "reopened");
  const netDiff = closed.reduce((s, r) => s + r.c.difference, 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {month > firstMonth ? (
            <Link href={`/closing/history?month=${addMonths(month, -1)}`} aria-label="Previous month" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
              <ChevronLeft size={22} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
          <p className="min-w-0 truncate text-center font-semibold text-slate-900">{monthLabel(month)}</p>
          {month < now ? (
            <Link href={`/closing/history?month=${addMonths(month, 1)}`} aria-label="Next month" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700">
              <ChevronRight size={22} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Days closed</dt>
            <dd className="font-semibold text-slate-900">{closed.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Days with a difference</dt>
            <dd className={`font-semibold ${mismatches.length ? "text-red-600" : "text-green-600"}`}>{mismatches.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Days not closed</dt>
            <dd className={`font-semibold ${missing.length ? "text-amber-700" : "text-slate-900"}`}>{missing.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Net difference</dt>
            <dd className={`font-semibold ${netDiff === 0 ? "text-green-600" : "text-red-600"}`}>{signed(netDiff)}</dd>
          </div>
        </dl>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No days to show" description="This month has no days yet." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const label = formatDate(dayRange(r.key).start);
            if (r.kind === "closed") {
              const bad = r.c.difference !== 0;
              return (
                <li key={r.key}>
                  <Link href={`/closing?date=${r.key}`} className={`block min-w-0 rounded-2xl p-4 shadow-sm ${bad ? "border border-red-300 bg-red-50" : "bg-white"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{label}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                        <Lock size={12} /> Closed
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Expected</p>
                        <p className="truncate font-semibold tabular-nums">{formatPKR(r.c.expectedClosing)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Counted</p>
                        <p className="truncate font-semibold tabular-nums">{formatPKR(r.c.actualCounted)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Difference</p>
                        <p className={`truncate font-bold tabular-nums ${bad ? "text-red-600" : "text-green-600"}`}>{signed(r.c.difference)}</p>
                      </div>
                    </div>
                    {bad && r.c.note && <p className="mt-2 break-words text-xs text-red-800">Note: {r.c.note}</p>}
                  </Link>
                </li>
              );
            }
            if (r.kind === "today") {
              return (
                <li key={r.key}>
                  <Link href="/closing" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <span>
                      <span className="block font-semibold text-slate-900">{label} (today)</span>
                      <span className="text-sm text-slate-500">Not closed yet</span>
                    </span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </Link>
                </li>
              );
            }
            return (
              <li key={r.key}>
                <Link href={`/closing?date=${r.key}`} className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-amber-900">{label}</span>
                    <span className="text-sm text-amber-800">{r.kind === "reopened" ? "Unlocked and not closed again" : "No closing recorded"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-500">History starts from your first closing ({formatDate(dayRange(firstKey).start)}). Tap a day to see its figures and every transaction.</p>
    </div>
  );
}
