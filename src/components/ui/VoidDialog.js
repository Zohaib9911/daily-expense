"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { btn, btnGhost, inputClass } from "@/lib/ui";

export const MIN_VOID_REASON = 5; // same rule as voidWithAudit() on the server

/**
 * Asks for a reason before voiding. `onSubmit(reason)` may be async (call a server action
 * that uses voidWithAudit). The dialog stays open and shows the error if it throws or
 * returns { error }; the parent closes it on success.
 */
export default function VoidDialog({ open, title = "Void this record?", description, onSubmit, onCancel, submitLabel = "Void record", successMessage }) {
  const toast = useToast();
  const lock = useRef(false); // blocks a second tap before React has re-rendered the disabled button
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = reason.trim().length >= MIN_VOID_REASON;

  const close = () => {
    if (busy) return;
    setReason("");
    setError("");
    onCancel?.();
  };

  async function submit(e) {
    e.preventDefault();
    if (!valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await onSubmit?.(reason.trim());
      if (res && typeof res === "object" && res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        setReason("");
        if (successMessage) toast.success(successMessage);
      }
    } catch (err) {
      const message = err?.message || "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          {description || "The record stays in the system, marked as voided, and can't be edited afterwards."}
        </p>
        <div>
          <label htmlFor="void-reason" className="mb-1.5 block text-sm font-medium text-slate-700">
            Reason (required)
          </label>
          <textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={`${inputClass} py-3`}
            placeholder="e.g. Entered twice by mistake"
          />
          <p className={`mt-1 text-xs ${valid ? "text-slate-500" : "text-slate-400"}`}>
            At least {MIN_VOID_REASON} characters.
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={busy} className={`${btnGhost} min-h-12`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className={`${btn} min-h-12 bg-red-600 text-white hover:bg-red-700`}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
