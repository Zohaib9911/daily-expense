"use client";

import { usePathname, useRouter } from "next/navigation";
import { daysInMonth, recentMonths } from "@/lib/salary";
import { inputClass } from "@/lib/ui";

/** Jump to a whole calendar month (sets range=custom&from=<1st>&to=<last day>), for example last October. */
export default function MonthPicker({ current }) {
  const router = useRouter();
  const pathname = usePathname();
  const months = recentMonths(24);

  function pick(e) {
    const m = e.target.value;
    if (!m) return;
    router.push(`${pathname}?range=custom&from=${m}-01&to=${m}-${String(daysInMonth(m)).padStart(2, "0")}`);
  }

  return (
    <div>
      <label htmlFor="report-month" className="mb-1.5 block text-xs font-medium text-slate-600">
        Or pick a whole month
      </label>
      <select id="report-month" value={current || ""} onChange={pick} className={inputClass}>
        <option value="">Choose a month...</option>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
