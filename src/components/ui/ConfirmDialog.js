"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { btn, btnGhost } from "@/lib/ui";

/**
 * Yes/no confirmation. `onConfirm` may be async; the dialog stays open and shows
 * the error if it throws or returns { error }. The parent closes it on success.
 *
 *   <ConfirmDialog open={o} title="Reactivate user?" message="..." onConfirm={run} onCancel={() => setO(false)} />
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  successMessage,
}) {
  const toast = useToast();
  const lock = useRef(false); // blocks a second tap before React has re-rendered the disabled button
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await onConfirm?.();
      if (res && typeof res === "object" && res.error) {
        setError(res.error);
        toast.error(res.error);
      } else if (successMessage) {
        toast.success(successMessage);
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

  const close = () => {
    if (busy) return;
    setError("");
    onCancel?.();
  };

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} disabled={busy} className={`${btnGhost} min-h-12`}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className={`${btn} min-h-12 text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}
