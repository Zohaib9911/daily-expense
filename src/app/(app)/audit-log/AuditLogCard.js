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

export default function AuditLogCard({ log, collectionLabel }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
              ACTION_STYLE[log.action] || "bg-slate-100 text-slate-700"
            }`}
          >
            {log.action}
          </span>
          <p className="mt-1 truncate text-base font-semibold text-slate-900">{collectionLabel}</p>
        </div>
        <p className="shrink-0 text-right text-xs text-slate-500">{formatDateTime(new Date(log.timestamp))}</p>
      </div>

      <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
        <div className="flex gap-1">
          <dt className="text-slate-500">By</dt>
          <dd className="font-medium text-slate-800">{log.userName || "Unknown"}</dd>
        </div>
        <div className="flex gap-1 break-all">
          <dt className="text-slate-500">Record</dt>
          <dd className="font-mono text-xs leading-5">{log.recordId}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">IP</dt>
          <dd className="text-xs leading-5">{log.ip || "unknown"}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {open ? "Hide changes" : "View changes"}
        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <AuditChanges oldValue={log.oldValue} newValue={log.newValue} />
        </div>
      )}
    </li>
  );
}
