"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveDateRange } from "@/lib/date-range";
import { btnPrimary, inputClass } from "@/lib/ui";

const OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" },
];

/**
 * Today / This Week / This Month / Custom. Keeps the choice in the URL
 * (?range=week, ?range=custom&from=2026-11-01&to=2026-11-07), so it survives refresh and
 * can be shared. On the server read it with resolveDateRange(await searchParams).
 */
export default function DateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = resolveDateRange(sp);
  const [custom, setCustom] = useState(current.range === "custom");
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);

  function push(range, extra = {}) {
    const q = new URLSearchParams(sp.toString());
    q.delete("page");
    q.delete("from");
    q.delete("to");
    q.set("range", range);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  function choose(value) {
    if (value === "custom") return setCustom(true);
    setCustom(false);
    push(value);
  }

  const selected = custom ? "custom" : current.range;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Date range" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={selected === o.value}
            className={`min-h-11 rounded-lg px-1 text-[13px] font-semibold ${
              selected === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {custom && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) push("custom", { from, to });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="df-from" className="mb-1 block text-xs font-medium text-slate-600">From</label>
              <input id="df-from" type="date" required value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div className="min-w-0">
              <label htmlFor="df-to" className="mb-1 block text-xs font-medium text-slate-600">To</label>
              <input id="df-to" type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <button type="submit" className={`${btnPrimary} w-full`}>Apply</button>
        </form>
      )}

      <p className="text-xs text-slate-500">Showing {current.label}</p>
    </div>
  );
}
