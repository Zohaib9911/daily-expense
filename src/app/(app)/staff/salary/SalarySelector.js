"use client";

import { inputClass, btnPrimary } from "@/lib/ui";

/**
 * Staff + month pickers. Changing either reloads the page with ?staff=&month=, and the server
 * works out the salary for that choice (so the figures can't be tampered with in the browser).
 */
export default function SalarySelector({ staff, months, staffId, month }) {
  const submit = (e) => e.currentTarget.form?.requestSubmit();
  return (
    <form method="get" className="space-y-3">
      <div>
        <label htmlFor="sel-staff" className="mb-1.5 block text-sm font-medium text-slate-700">Staff member</label>
        <select id="sel-staff" name="staff" defaultValue={staffId} onChange={submit} className={inputClass}>
          <option value="">Choose...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.role ? ` (${s.role})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sel-month" className="mb-1.5 block text-sm font-medium text-slate-700">Month</label>
        <select id="sel-month" name="month" defaultValue={month} onChange={submit} className={inputClass}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className={`${btnPrimary} w-full`}>Calculate salary</button>
    </form>
  );
}
