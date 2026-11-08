import Link from "next/link";
import Card from "@/components/ui/Card";
import { WEB_ROW_LIMIT } from "@/lib/reports/common";
import { formatValue, toneOf } from "@/lib/reports/format";

const TONE = { in: "text-green-600", out: "text-red-600", neutral: "text-slate-900" };
const RIGHT = new Set(["money", "int", "pct"]);

function SummaryCards({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium leading-snug text-slate-500">{s.label}</p>
          <p className={`mt-1 break-words font-bold ${s.kind === "text" ? "text-base" : "text-xl"} ${TONE[toneOf(s.tone, s.value)]}`}>{formatValue(s.value, s.kind) || "—"}</p>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ table }) {
  const { columns, rows, totals } = table;
  const shown = rows.slice(0, WEB_ROW_LIMIT);
  const cell = (row, col) => {
    const v = row[col.key];
    const text = formatValue(v, col.type);
    if (col.link && row._href && text) {
      return (
        <Link href={row._href} className="font-medium text-blue-900 underline-offset-2 hover:underline">
          {text}
        </Link>
      );
    }
    return text;
  };

  return (
    <Card title={table.title}>
      {table.note && <p className="-mt-1 mb-3 text-xs text-slate-500">{table.note}</p>}
      {rows.length === 0 && !totals ? (
        <p className="text-sm text-slate-500">Nothing in this period.</p>
      ) : (
        <>
          {/* Wide tables scroll sideways inside this box; the page itself never does. */}
          <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0} role="region" aria-label={`${table.title} table`}>
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((c, i) => (
                    <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${RIGHT.has(c.type) ? "text-right" : "text-left"} ${i === 0 ? "sticky left-0 bg-slate-50" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((row, ri) => (
                  <tr key={ri}>
                    {columns.map((c, i) => {
                      const v = row[c.key];
                      const tone = c.type === "money" ? TONE[toneOf(c.tone, v)] : "text-slate-800";
                      return (
                        <td key={c.key} className={`px-3 py-2.5 ${RIGHT.has(c.type) ? "whitespace-nowrap text-right tabular-nums" : c.w >= 4 ? "min-w-48" : "whitespace-nowrap"} ${tone} ${i === 0 ? "sticky left-0 bg-white font-medium" : ""}`}>
                          {cell(row, c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    {columns.map((c, i) => {
                      const v = totals[c.key];
                      const tone = c.type === "money" && v !== undefined ? TONE[toneOf(c.tone, v)] : "text-slate-900";
                      return (
                        <td key={c.key} className={`px-3 py-2.5 ${RIGHT.has(c.type) ? "whitespace-nowrap text-right tabular-nums" : "whitespace-nowrap"} ${tone} ${i === 0 ? "sticky left-0 bg-slate-50" : ""}`}>
                          {formatValue(v, c.type)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {rows.length > WEB_ROW_LIMIT && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the first {WEB_ROW_LIMIT} of {rows.length} rows. Totals include everything. Export to Excel or PDF for all rows.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
        </>
      )}
    </Card>
  );
}

/** Summary cards first (easy to read on a phone), then every table. */
export default function ReportView({ report }) {
  return (
    <div className="space-y-4">
      <SummaryCards items={report.summary} />
      {report.tables.map((t) => (
        <ReportTable key={t.id} table={t} />
      ))}
    </div>
  );
}
