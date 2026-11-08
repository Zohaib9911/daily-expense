"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

const ROLE_LABEL = { admin: "Owner (admin)", manager: "Manager", viewer: "Viewer (read-only)" };

export default function UserMenu({ name, role }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        className="flex h-11 items-center gap-2 rounded-full pl-1 pr-3 hover:bg-slate-100"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 sm:block">{name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[role] || role}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signOut({ callbackUrl: "/login" });
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut size={18} />
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
