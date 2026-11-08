import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePageUser } from "@/lib/auth-helpers";
import { reportsFor } from "@/lib/reports";

export const metadata = { title: "Reports" };

export default async function ReportsIndexPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Pick a report, choose the dates, then read it here or export it to Excel or PDF.</p>
      <ul className="space-y-3">
        {reportsFor(user.role).map(([slug, r]) => {
          const Icon = r.icon;
          return (
            <li key={slug}>
              <Link href={`/reports/${slug}?range=month`} className="flex min-h-20 items-center gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-900">
                  <Icon size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{r.title}</span>
                  <span className="block text-sm text-slate-500">{r.blurb}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
