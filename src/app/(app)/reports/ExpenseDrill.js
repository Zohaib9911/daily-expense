import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

/** Expense report drill-down: category > payee/item > transactions (each links to the expense). */
export default function ExpenseDrill({ groups }) {
  if (!groups.length) return null;
  return (
    <Card title="Drill down">
      <p className="-mt-1 mb-3 text-xs text-slate-500">Tap a category to see who was paid, then a payee to see each transaction.</p>
      <ul className="space-y-2">
        {groups.map((c) => (
          <li key={c.label}>
            <details className="group rounded-xl border border-slate-200">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-slate-900">
                <span className="min-w-0 truncate">
                  {c.label} <span className="font-normal text-slate-500">({c.n})</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-red-600">{formatPKR(c.total)}</span>
                  <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <ul className="space-y-1 border-t border-slate-100 p-2">
                {c.payees.map((p) => (
                  <li key={p.label}>
                    <details className="group/p rounded-lg bg-slate-50">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm text-slate-800">
                        <span className="min-w-0 truncate">
                          {p.label} <span className="text-slate-500">({p.n})</span>
                        </span>
                        <span className="shrink-0 font-medium text-red-600">{formatPKR(p.total)}</span>
                      </summary>
                      <ul className="divide-y divide-slate-200 border-t border-slate-200 px-3">
                        {p.txs.map((t) => (
                          <li key={t.id}>
                            <Link href={`/expenses/${t.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                              <span className="min-w-0">
                                <span className="block text-slate-800">
                                  {formatDate(t.date)} · {t.method}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                  {t.by ? `by ${t.by}` : ""}
                                  {t.note ? ` · ${t.note}` : ""}
                                </span>
                                {t.pending && <StatusBadge status="pending_approval" className="mt-1" />}
                              </span>
                              <span className="shrink-0 font-semibold text-red-600">{formatPKR(t.amount)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
