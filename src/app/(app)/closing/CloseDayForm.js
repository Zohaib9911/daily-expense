"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { closeDay } from "./actions";
import { formatPKR } from "@/lib/format";
import { btnPrimary, inputClass } from "@/lib/ui";

const num = (v) => Number(String(v ?? "").replace(/\D/g, "")) || 0;

/**
 * Count the cash drawer and close the day. Figures come from the server; the expected cash and the
 * difference update live as you type the counted amount. The server recomputes everything on close.
 */
export default function CloseDayForm({ date, openingValue, canEditOpening, cashIn, cashOut }) {
  const router = useRouter();
  const [actualText, setActualText] = useState("");
  const [openingText, setOpeningText] = useState(String(openingValue || ""));
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");

  const opening = canEditOpening ? num(openingText) : openingValue;
  const expected = opening + cashIn - cashOut;
  const entered = actualText !== "";
  const actual = num(actualText);
  const diff = actual - expected;
  const matches = entered && diff === 0;
  const needsNote = entered && diff !== 0;
  const noteMissing = needsNote && !note.trim();

  async function submit() {
    const res = await closeDay({
      date,
      actualCounted: actual,
      note,
      expectedSeen: expected,
      openingOverride: canEditOpening ? opening : undefined,
    });
    if (res?.ok) {
      setConfirm(false);
      router.refresh();
      return;
    }
    if (/changed while/.test(res?.error || "")) router.refresh(); // show the new figures
    return { error: res?.error || "Could not close the day" };
  }

  function tryClose() {
    setError("");
    if (!entered) return setError("Enter the cash you counted.");
    if (noteMissing) return setError("The counted cash doesn't match. Write a note explaining the difference.");
    setConfirm(true);
  }

  return (
    <>
      <Card title="Count the cash" className="space-y-4">
        {canEditOpening && (
          <div>
            <label htmlFor="opening" className="mb-1.5 block text-sm font-medium text-slate-700">
              Opening cash (first closing, owner only)
            </label>
            <input id="opening" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={openingText} onChange={(e) => setOpeningText(e.target.value.replace(/\D/g, ""))} placeholder="0" className={inputClass} />
            <p className="mt-1 text-xs text-slate-500">The cash in the drawer when you start using this app. Later days carry on from each day&apos;s count.</p>
          </div>
        )}

        <div>
          <label htmlFor="actual" className="mb-1.5 block text-sm font-medium text-slate-700">
            Cash counted in the drawer (PKR)
          </label>
          <input
            id="actual"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            value={actualText}
            onChange={(e) => setActualText(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} min-h-16 text-3xl font-bold tabular-nums`}
          />
        </div>

        <div className={`rounded-2xl px-4 py-5 text-center ${!entered ? "bg-slate-50" : matches ? "bg-green-50" : "bg-red-50"}`} aria-live="polite">
          <p className="text-sm font-medium text-slate-600">Difference</p>
          <p className={`text-4xl font-extrabold tabular-nums ${!entered ? "text-slate-300" : matches ? "text-green-600" : "text-red-600"}`}>
            {!entered ? "—" : diff === 0 ? "Rs 0" : `${diff > 0 ? "+" : "-"}${formatPKR(Math.abs(diff))}`}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {!entered ? `Expected cash: ${formatPKR(expected)}` : matches ? "Cash matches" : diff > 0 ? "More cash than expected" : "Less cash than expected"}
          </p>
        </div>

        {needsNote && (
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">
              Note <span className="text-red-600">(required: explain the difference)</span>
            </label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-3`} />
          </div>
        )}
        {entered && !needsNote && (
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">Note (optional)</label>
            <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-3`} />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="button" onClick={tryClose} className={`${btnPrimary} min-h-14 w-full text-base`}>
          <Lock size={18} />
          Close day
        </button>
      </Card>

      <ConfirmDialog
        open={confirm}
        title="Close this day?"
        message={`Expected ${formatPKR(expected)}, counted ${formatPKR(actual)}${diff !== 0 ? ` (difference ${formatPKR(Math.abs(diff))})` : ""}. Closing locks the day: managers can no longer add, change or void entries dated on it. Only the owner can unlock it.`}
        confirmLabel="Close and lock"
        successMessage="Day closed and locked"
        onConfirm={submit}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
