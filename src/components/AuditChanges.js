"use client";

import { diffValues } from "@/lib/diff";

/** Changed fields of one audit entry: old value in red, new value in green. */
export default function AuditChanges({ oldValue, newValue }) {
  const rows = diffValues(oldValue, newValue);
  if (!rows.length) return <p className="text-sm text-slate-500">No field changes recorded.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <p className="mb-1 font-mono text-xs font-semibold text-slate-500">{r.key}</p>
          {r.hasOld && (
            <p className="break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="mr-2 text-xs font-semibold uppercase">Was</span>
              <span className="line-through decoration-red-300">{r.old}</span>
            </p>
          )}
          {r.hasNew && (
            <p className={`break-words rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ${r.hasOld ? "mt-1" : ""}`}>
              <span className="mr-2 text-xs font-semibold uppercase">{r.hasOld ? "Now" : "New"}</span>
              {r.new}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
