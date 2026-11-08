import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronRight, Info } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import { CategoryDonut, DailyBars } from "@/components/dashboard/Charts";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { resolveDateRange } from "@/lib/date-range";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CATEGORY_META } from "@/lib/expense-meta";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { currentMonth, monthLabel } from "@/lib/salary";
import { alerts, cashInHand, dailySeries, expenseByCategory, ordersByStatus, pendingMoney, periodTotals, recentActivity } from "@/lib/dashboard";

export const metadata = { title: "Dashboard" };

// Category colours: the validated categorical palette, one FIXED colour per category (colour follows the
// category, never its rank). Marketing and Misc have no colour of their own and always fall into "Other".
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const SLOT = { salary: 0, raw_material: 1, staff_advance: 2, food: 3, transport: 4, utilities: 5, rent: 6, tools_repair: 7 };
const OTHER_COLOR = "#898781";

const SHORT = { today: "Today", week: "This week", month: "This month" };

const TONE = {
  red: { box: "border-red-200 bg-red-50", text: "text-red-800", icon: "text-red-600" },
  amber: { box: "border-amber-200 bg-amber-50", text: "text-amber-900", icon: "text-amber-600" },
  blue: { box: "border-blue-200 bg-blue-50", text: "text-blue-900", icon: "text-blue-600" },
};

function Stat({ label, tone, children, sub, href }) {
  const body = (
    <div className="h-full min-w-0 rounded-2xl bg-white p-4 shadow-sm">
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-bold ${tone}`}>{children}</p>
      {sub && <p className="mt-1 text-xs leading-snug text-slate-500">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0 active:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

function MoneyRow({ href, label, count, noun, children }) {
  return (
    <Link href={href} className="flex min-h-14 items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">
          {count} {noun}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {children}
        <ChevronRight size={16} className="text-slate-400" />
      </span>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = resolveDateRange(sp);
  const period = SHORT[range.range] ?? range.label;
  const month = currentMonth();

  await connectDB();
  const [totals, hand, alertList, money, byCategory, series, statuses, activity] = await Promise.all([
    periodTotals(range),
    cashInHand(),
    alerts(user),
    pendingMoney(),
    expenseByCategory(month),
    dailySeries(30),
    ordersByStatus(),
    recentActivity(10),
  ]);

  // Donut: the 5 biggest categories that have their own colour (shown in colour order), everything else as "Other".
  const monthTotal = byCategory.reduce((s, c) => s + c.total, 0);
  const top = byCategory.filter((c) => c.category in SLOT).slice(0, 5);
  const topNames = new Set(top.map((c) => c.category));
  const otherTotal = byCategory.filter((c) => !topNames.has(c.category)).reduce((s, c) => s + c.total, 0);
  const segments = [
    ...[...top].sort((a, b) => SLOT[a.category] - SLOT[b.category]).map((c) => ({ name: CATEGORY_META[c.category].label, value: c.total, color: PALETTE[SLOT[c.category]] })),
    ...(otherTotal > 0 ? [{ name: "Other", value: otherTotal, color: OTHER_COLOR }] : []),
  ];
  const colorOf = (cat) => (topNames.has(cat) ? PALETTE[SLOT[cat]] : OTHER_COLOR);

  const hasSeries = series.some((d) => d.in > 0 || d.out > 0);

  return (
    <div className="space-y-4">
      <Card>
        <DateFilter />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label={`Cash in · ${period}`} tone="text-green-600" href="/payments" sub={`Cash ${formatPKR(totals.inCash)} · other ${formatPKR(totals.inAll - totals.inCash)}`}>
          {formatPKR(totals.inAll)}
        </Stat>
        <Stat
          label={`Cash out · ${period}`}
          tone="text-red-600"
          href="/expenses"
          sub={`Cash ${formatPKR(totals.outCash)} · other ${formatPKR(totals.outAll - totals.outCash)}${totals.pendingOut > 0 ? ` · ${formatPKR(totals.pendingOut)} awaiting approval, not counted` : ""}`}
        >
          {formatPKR(totals.outAll)}
        </Stat>
        <Stat
          label="Cash in hand"
          tone="text-slate-900"
          href="/closing"
          sub={
            hand.kind === "counted"
              ? `Counted today${hand.difference !== 0 ? ` (${hand.difference > 0 ? "+" : "-"}${formatPKR(Math.abs(hand.difference))})` : ""}`
              : hand.kind === "live"
                ? `Expected now. Last counted ${formatPKR(hand.lastCounted)} on ${formatDate(new Date(`${hand.lastKey}T07:00:00Z`))}`
                : "Close your first day to start tracking"
          }
        >
          {hand.kind === "none" ? "—" : formatPKR(hand.value)}
        </Stat>
        <Stat label={`Profit · ${period}`} tone={totals.profit >= 0 ? "text-green-600" : "text-red-600"} sub="Money received minus money spent">
          {totals.profit < 0 ? `-${formatPKR(-totals.profit)}` : formatPKR(totals.profit)}
        </Stat>
      </div>

      <Card title="Alerts">
        {alertList.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={18} />
            Nothing needs attention.
          </p>
        ) : (
          <ul className="space-y-2">
            {alertList.map((a) => {
              const t = TONE[a.tone];
              const Icon = a.tone === "blue" ? Info : AlertTriangle;
              const inner = (
                <>
                  <Icon size={18} className={`mt-0.5 shrink-0 ${t.icon}`} />
                  <span className={`min-w-0 flex-1 text-sm ${t.text}`}>
                    <span className="font-semibold">{a.text}</span>
                    {a.detail?.amount !== undefined && <span> (net {a.detail.amount < 0 ? "-" : "+"}{formatPKR(Math.abs(a.detail.amount))})</span>}
                    {a.detail?.money !== undefined && <span> ({formatPKR(a.detail.money)})</span>}
                    {a.sub && <span className="block text-xs opacity-80">{a.sub}</span>}
                  </span>
                  {a.cta && <span className={`shrink-0 text-xs font-semibold underline ${t.text}`}>{a.cta}</span>}
                </>
              );
              return (
                <li key={a.key}>
                  {a.href ? (
                    <Link href={a.href} className={`flex min-h-11 items-start gap-2 rounded-xl border px-3 py-2.5 ${t.box}`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={`flex min-h-11 items-start gap-2 rounded-xl border px-3 py-2.5 ${t.box}`}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Pending money">
        <div className="divide-y divide-slate-100">
          <MoneyRow href="/orders?tab=all" label="Customers owe you" count={money.customers.n} noun={money.customers.n === 1 ? "order" : "orders"}>
            <MoneyText amount={money.customers.total} type="in" />
          </MoneyRow>
          <MoneyRow href="/suppliers" label="You owe suppliers" count={money.suppliers.n} noun={money.suppliers.n === 1 ? "supplier" : "suppliers"}>
            <MoneyText amount={money.suppliers.total} type="out" />
          </MoneyRow>
          <MoneyRow href="/staff" label="Staff advances to recover" count={money.advances.n} noun={money.advances.n === 1 ? "person" : "people"}>
            <MoneyText amount={money.advances.total} type="out" />
          </MoneyRow>
        </div>
      </Card>

      <Card title="Spending by category">
        <p className="-mt-2 mb-3 text-xs text-slate-500">{monthLabel(month)}</p>
        {monthTotal === 0 ? (
          <p className="text-sm text-slate-500">No spending recorded this month yet.</p>
        ) : (
          <>
            <CategoryDonut segments={segments} total={monthTotal} />
            <ul className="mt-2 divide-y divide-slate-100">
              {byCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: colorOf(c.category) }} />
                    <span className="truncate text-sm text-slate-800">{CATEGORY_META[c.category]?.label || c.category}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="font-semibold text-slate-900">{formatPKR(c.total)}</span>
                    <span className="ml-2 text-xs text-slate-500">{Math.round((c.total / monthTotal) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
            {otherTotal > 0 && <p className="mt-1 text-xs text-slate-500">Grey = grouped as &quot;Other&quot; in the chart.</p>}
          </>
        )}
      </Card>

      <Card title="Last 30 days">
        {hasSeries ? (
          <>
            <DailyBars data={series} />
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-900">View as table</summary>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Day</th>
                      <th className="px-3 py-2 text-right font-semibold">In</th>
                      <th className="px-3 py-2 text-right font-semibold">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...series].reverse().map((d) => (
                      <tr key={d.key}>
                        <td className="px-3 py-2 text-slate-700">{formatDate(new Date(`${d.key}T07:00:00Z`))}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-600">{formatPKR(d.in)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatPKR(d.out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-slate-500">No money moved in the last 30 days.</p>
        )}
      </Card>

      <Card title="Orders">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["pending", "in_production", "ready", "delivered", "cancelled"].map((s) => (
            <Link key={s} href={`/orders?tab=${s === "cancelled" ? "all" : s}`} className="flex min-h-20 min-w-0 flex-col items-start justify-between rounded-xl border border-slate-200 p-3 active:bg-slate-50">
              <StatusBadge status={s} label={ORDER_STATUS_LABELS[s]} />
              <span className="mt-2 text-2xl font-bold text-slate-900">{statuses[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing has been entered yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.dir === "in" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                    {a.dir === "in" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {a.category ? CATEGORY_META[a.category]?.label || a.category : a.kind}
                      {a.sub ? ` · ${a.sub.replace(/ · paid \d+$/, "")}` : ""}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      by {a.who || "Unknown"} · {formatDateTime(new Date(a.at))}
                      {a.paid !== undefined && ` · paid ${formatPKR(a.paid)}`}
                    </span>
                    {a.pending && <StatusBadge status="pending_approval" className="mr-1 mt-1" />}
                    {a.backdated && <StatusBadge status="backdated" label="Backdated" className="mt-1" />}
                  </span>
                  <MoneyText amount={a.amount} type={a.dir} sign className="text-sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
