"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { isActivePath, routesFor } from "@/lib/nav";
import CountBadge from "./CountBadge";

/** Desktop (md+) left sidebar with every link the role may see. Hidden on phones. */
export default function Sidebar({ role, shopName, pendingCount = 0 }) {
  const pathname = usePathname();
  const items = routesFor(role);

  return (
    <aside className="print:!hidden fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-900 text-white">
          <Store size={20} />
        </span>
        <span className="min-w-0 truncate text-base font-bold text-slate-900">{shopName}</span>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ key, href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                active ? "bg-blue-50 text-blue-900" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={20} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {key === "approvals" && <CountBadge count={pendingCount} />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
