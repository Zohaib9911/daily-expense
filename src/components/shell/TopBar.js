"use client";

import { usePathname } from "next/navigation";
import UserMenu from "@/components/UserMenu";
import { titleForPath } from "@/lib/nav";

/** Fixed top bar: current page title + user avatar menu. Respects the iPhone notch. */
export default function TopBar({ name, role }) {
  const title = titleForPath(usePathname());
  return (
    <header className="print:!hidden fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:left-60">
      <div className="flex h-14 items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-lg font-bold text-slate-900">{title}</h1>
        <UserMenu name={name} role={role} />
      </div>
    </header>
  );
}
