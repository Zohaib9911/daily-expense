"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centred modal from md up. Built on the native <dialog>, so
 * focus trapping, Esc to close and the inert background come from the browser.
 *
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="Quick add">...</BottomSheet>
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Stop the page behind from scrolling while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose} // fires for Esc and for d.close(); onClose must be idempotent
      onClick={(e) => e.target === ref.current && onClose()} // click on the dimmed backdrop
      className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40 md:m-auto md:max-w-md md:rounded-2xl"
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 id={titleId} className="min-w-0 truncate text-lg font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X size={22} />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
