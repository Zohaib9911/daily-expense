"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Ellipsis, LogOut, Plus } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import CountBadge from "./CountBadge";
import {
  BOTTOM_LEFT,
  BOTTOM_RIGHT,
  canAdd,
  isActivePath,
  moreItemsFor,
  quickActionsFor,
} from "@/lib/nav";

const TONE_BG = {
  in: "bg-green-50 text-green-600",
  out: "bg-red-50 text-red-600",
  neutral: "bg-blue-50 text-blue-900",
};

const slot = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium";

/**
 * Phone bottom navigation (hidden from md up): Home, Orders, big "+", Expenses, More.
 * "+" opens the quick-action sheet (hidden for read-only viewers); More opens the menu.
 */
export default function BottomNav({ role, pendingCount = 0 }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(null); // "add" | "more" | null
  const close = () => setSheet(null);
  const [busy, setBusy] = useState(false);

  const moreItems = moreItemsFor(role);
  const moreActive = moreItems.some((i) => isActivePath(pathname, i.href));

  const link = ({ key, href, label, icon: Icon }) => {
    const active = isActivePath(pathname, href);
    return (
      <Link
        key={key}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${slot} ${active ? "text-blue-900" : "text-slate-500"}`}
      >
        <Icon size={22} />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="print:!hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
      >
        <div className="flex h-16 items-stretch">
          {BOTTOM_LEFT.map(link)}

          {canAdd(role) && (
            <div className="flex flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setSheet("add")}
                aria-label="Add"
                aria-haspopup="dialog"
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-900 text-white shadow-lg ring-4 ring-white active:scale-95"
              >
                <Plus size={30} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {BOTTOM_RIGHT.map(link)}

          <button
            type="button"
            onClick={() => setSheet("more")}
            aria-haspopup="dialog"
            className={`${slot} ${moreActive ? "text-blue-900" : "text-slate-500"}`}
          >
            <span className="relative">
              <Ellipsis size={22} />
              <CountBadge count={pendingCount} className="absolute -right-3.5 -top-2 ring-2 ring-white" />
            </span>
            <span>More</span>
          </button>
        </div>
      </nav>

      <BottomSheet open={sheet === "add"} onClose={close} title="Quick add">
        <ul className="grid grid-cols-2 gap-3">
          {quickActionsFor(role).map(({ label, href, icon: Icon, tone }) => (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                onClick={close}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 p-3 text-center text-sm font-semibold text-slate-800 active:bg-slate-50"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${TONE_BG[tone]}`}>
                  <Icon size={22} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet open={sheet === "more"} onClose={close} title="More">
        <ul className="grid grid-cols-3 gap-3">
          {moreItems.map(({ key, label, href, icon: Icon }) => (
            <li key={key} className="min-w-0">
              <Link
                href={href}
                onClick={close}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 p-2 text-center text-xs font-semibold leading-tight text-slate-800 active:bg-slate-50"
              >
                <span className="relative">
                  <Icon size={24} className="text-blue-900" />
                  {key === "approvals" && <CountBadge count={pendingCount} className="absolute -right-4 -top-2" />}
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            signOut({ callbackUrl: "/login" });
          }}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <LogOut size={18} />
          {busy ? "Signing out..." : "Logout"}
        </button>
      </BottomSheet>
    </>
  );
}
