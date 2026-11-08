"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPKR } from "@/lib/format";

// Chart colours. Money in/out use the same green/red as <MoneyText />. Category colours come from the
// validated categorical palette (fixed per category, see CATEGORY_SLOT in the dashboard page).
const IN = "#16a34a";
const OUT = "#dc2626";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";

const compact = (n) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
const shortDay = (key) => {
  const [, m, d] = key.split("-");
  return `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}`;
};

function TooltipBox({ children }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">{children}</div>;
}

/**
 * Donut of one month's spending. `segments`: [{ name, value, color }] (at most 6, "Other" last).
 * `total` is printed in the middle. Names and amounts are also listed beside it by the page.
 */
export function CategoryDonut({ segments, total }) {
  return (
    <div className="relative h-52 w-full min-w-0" role="img" aria-label={`Spending by category, total ${formatPKR(total)}`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 208 }}>
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="92%"
            paddingAngle={2} // the 2px gap between segments
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {segments.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <p className="font-semibold text-slate-900">{payload[0].name}</p>
                  <p className="text-slate-600">
                    {formatPKR(payload[0].value)} · {Math.round((payload[0].value / total) * 100)}%
                  </p>
                </TooltipBox>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-slate-500">Spent</span>
        <span className="text-lg font-bold text-slate-900">{formatPKR(total)}</span>
      </div>
    </div>
  );
}

/** Money in vs money out for each day. `data`: [{ key: "yyyy-MM-dd", in, out }]. */
export function DailyBars({ data }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: IN }} /> Money in
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT }} /> Money out
        </span>
      </div>
      <div className="h-56 w-full min-w-0" role="img" aria-label="Money in and money out for each of the last 30 days">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 224 }}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={1} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="key" tickFormatter={shortDay} interval={6} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: MUTED, fontSize: 12 }} tickMargin={6} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={38} tickCount={4} tick={{ fill: MUTED, fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(11,11,11,0.05)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <p className="mb-1 font-semibold text-slate-900">{shortDay(payload[0].payload.key)}</p>
                    <p style={{ color: IN }}>In: {formatPKR(payload[0].payload.in)}</p>
                    <p style={{ color: OUT }}>Out: {formatPKR(payload[0].payload.out)}</p>
                  </TooltipBox>
                ) : null
              }
            />
            <Bar dataKey="in" fill={IN} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="out" fill={OUT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
