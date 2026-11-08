"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import AuditChanges from "@/components/AuditChanges";
import { formatDateTime } from "@/lib/dates";

const ACTION_STYLE = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-amber-50 text-amber-700",
  void: "bg-red-50 text-red-700",
  approve: "bg-emerald-50 text-emerald-700",
  reject: "bg-red-50 text-red-700",
};
const VERB = { create: "Created", update: "Edited", void: "Voided", approve: "Approved", reject: "Rejected" };

function Entry({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_STYLE[entry.action] || "bg-slate-100 text-slate-700"}`}>
            {VERB[entry.action] || entry.action}
          </span>
          <p className="mt-1 truncate text-sm text-slate-700">
            by <span className="font-medium text-slate-900">{entry.userName || "Unknown"}</span>
          </p>
        </div>
        <p className="shrink-0 text-right text-xs text-slate-500">{formatDateTime(new Date(entry.timestamp))}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-900"
      >
        {open ? "Hide changes" : "View changes"}
        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>
      {open && <AuditChanges oldValue={entry.oldValue} newValue={entry.newValue} />}
    </li>
  );
}

/** Newest-first history of one record, from AuditLog. entries: [{ id, action, userName, timestamp(ISO), oldValue, newValue }] */
export default function AuditHistory({ entries }) {
  if (!entries.length) return <p className="text-sm text-slate-500">No history recorded.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((e) => (
        <Entry key={e.id} entry={e} />
      ))}
    </ul>
  );
}
