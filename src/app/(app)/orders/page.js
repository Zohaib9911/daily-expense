import Link from "next/link";
import { ClipboardList, Plus, Search } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import Order from "@/models/Order";
import OrderCard from "./OrderCard";

export const metadata = { title: "Orders" };

const PAGE_SIZE = 20;
const TABS = [
  { key: "pending", label: "Pending", status: "pending" },
  { key: "in_production", label: "In Production", status: "in_production" },
  { key: "ready", label: "Ready", status: "ready" },
  { key: "delivered", label: "Delivered", status: "delivered" },
  { key: "all", label: "All" },
];
const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function OrdersPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  const tab = TABS.find((t) => t.key === one(sp.tab)) ?? TABS[0];
  const q = one(sp.q).trim().slice(0, 60);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  // Search: customer name, phone (digits only, so "0300-123" finds "03001234567") or order number.
  const search = {};
  if (q) {
    const phoneDigits = q.replace(/\D/g, "");
    search.$or = [
      { customerName: new RegExp(escapeRegex(q), "i") },
      { orderNo: new RegExp(escapeRegex(q), "i") },
      ...(phoneDigits.length >= 3 ? [{ customerPhone: new RegExp(phoneDigits.split("").join("\\D*")) }] : []),
    ];
  }
  const filter = { ...search, ...(tab.status ? { status: tab.status } : {}) };

  await connectDB();
  const [docs, count, counts] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: search }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const countOf = (status) => counts.find((c) => c._id === status)?.n ?? 0;
  const allCount = counts.reduce((s, c) => s + c.n, 0);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (t, p = 1) => {
    const params = new URLSearchParams();
    params.set("tab", t);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return `/orders?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <form method="get" role="search" className="flex gap-2">
        <input type="hidden" name="tab" value={tab.key} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Customer name or phone"
          aria-label="Search orders by customer name or phone"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" aria-label="Search" className={`${btnPrimary} w-12 shrink-0 px-0`}>
          <Search size={20} />
        </button>
      </form>

      <nav aria-label="Order status" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.status ? countOf(t.status) : allCount;
          const active = t.key === tab.key;
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${
                active ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {t.label}
              <span className={`text-xs ${active ? "text-blue-100" : "text-slate-500"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {WRITER_ROLES.includes(user.role) && (
        <Link href="/orders/new" className={`${btnPrimary} min-h-12 w-full`}>
          <Plus size={20} />
          New order
        </Link>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders found"
          description={
            q
              ? `Nothing matches "${q}" in ${tab.status ? ORDER_STATUS_LABELS[tab.status] : "any status"}.`
              : tab.status
                ? `There are no ${ORDER_STATUS_LABELS[tab.status].toLowerCase()} orders.`
                : "Create your first order with the + button."
          }
        />
      ) : (
        <ul className="space-y-3">
          {docs.map((o) => (
            <OrderCard key={String(o._id)} o={o} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? <Link href={href(tab.key, page - 1)} className={btnGhost}>Newer</Link> : <span />}
          <span className="text-sm text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(tab.key, page + 1)} className={btnGhost}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
