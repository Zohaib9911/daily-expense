"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

// App-wide toasts. The provider lives in the signed-in layout, so a toast raised just before a
// router.push() survives the navigation.
//   const toast = useToast();  toast.success("Expense saved");  toast.error("Could not save");
// Errors stay a little longer. Max 3 on screen. Screen readers: success = polite, error = assertive.

const ToastContext = createContext(null);
const NOOP = { success() {}, error() {}, dismiss() {} };

export function useToast() {
  return useContext(ToastContext) ?? NOOP;
}

const MAX = 3;
const LIFETIME = { success: 4000, error: 7000 };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message) => {
      const text = String(message || "").trim();
      if (!text) return;
      const id = ++seq.current;
      setItems((list) => {
        // Same message already showing: don't stack duplicates (double taps, retries).
        if (list.some((t) => t.type === type && t.message === text)) return list;
        return [...list, { id, type, message: text }].slice(-MAX);
      });
      timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[type]));
    },
    [dismiss]
  );

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((h) => clearTimeout(h));
  }, []);

  const api = useMemo(() => ({ success: (m) => push("success", m), error: (m) => push("error", m), dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="print:!hidden pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 top-[calc(4rem+env(safe-area-inset-top))] md:left-60"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
              t.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {t.type === "error" ? <CircleAlert size={20} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={20} className="mt-0.5 shrink-0" />}
            <p className="min-w-0 flex-1 break-words font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl opacity-70 hover:opacity-100"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
