"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { markAllPresent, markAttendance } from "../actions";

const OPTIONS = [
  { value: "present", label: "Present", on: "bg-green-600 text-white border-green-600", off: "text-green-700 border-green-200" },
  { value: "half_day", label: "Half day", on: "bg-amber-500 text-white border-amber-500", off: "text-amber-700 border-amber-200" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white border-red-600", off: "text-red-700 border-red-200" },
];

/**
 * One row per staff member with one-tap Present / Half day / Absent. `rows`: [{ id, name, role, status }].
 * The new status shows at once and is rolled back with a message if the server refuses it.
 */
export default function AttendanceList({ date, rows, canEdit }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(() => Object.fromEntries(rows.map((r) => [r.id, r.status])));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function mark(id, next) {
    if (!canEdit || status[id] === next) return;
    const previous = status[id];
    setError("");
    setStatus((s) => ({ ...s, [id]: next }));
    startTransition(async () => {
      const res = await markAttendance(id, date, next);
      if (!res?.ok) {
        setStatus((s) => ({ ...s, [id]: previous }));
        const message = res?.error || "Could not save. Please try again.";
        setError(message);
        toast.error(message);
      } else {
        const who = rows.find((r) => r.id === id)?.name;
        toast.success(`${who}: ${OPTIONS.find((o) => o.value === next).label}`);
        router.refresh();
      }
    });
  }

  function allPresent() {
    setError("");
    startTransition(async () => {
      const res = await markAllPresent(date);
      if (!res?.ok) {
        const message = res?.error || "Could not save. Please try again.";
        setError(message);
        toast.error(message);
      } else {
        toast.success("Everyone unmarked is now present");
        setStatus((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v || "present"])));
        router.refresh();
      }
    });
  }

  const unmarked = Object.values(status).filter((v) => !v).length;

  return (
    <div className="space-y-3">
      {canEdit && unmarked > 0 && (
        <button
          type="button"
          onClick={allPresent}
          disabled={pending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-green-600 bg-white text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-60"
        >
          <Check size={18} />
          Mark all {unmarked} unmarked as present
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm">
            <p className="truncate text-base font-semibold text-slate-900">{r.name}</p>
            <p className="mb-3 truncate text-sm text-slate-500">{r.role || "—"}</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Attendance for ${r.name}`}>
              {OPTIONS.map((o) => {
                const selected = status[r.id] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => mark(r.id, o.value)}
                    disabled={!canEdit || pending}
                    aria-pressed={selected}
                    className={`min-h-12 rounded-xl border px-1 text-sm font-semibold disabled:cursor-default ${selected ? o.on : `bg-white ${o.off}`} ${!canEdit && !selected ? "opacity-40" : ""}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
