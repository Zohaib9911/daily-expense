"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import MoneyText from "@/components/ui/MoneyText";
import { inputClass } from "@/lib/ui";

/**
 * Searchable order picker. `value` is the chosen order ({ id, orderNo, customerName, balance, ... })
 * or null. Searches /api/orders/search as you type. Default: open orders with a balance left (Receive Payment).
 * `scope="all"`: any order (linking an expense to an order); then the amounts shown are the order value, not the balance.
 */
export default function OrderPicker({ value, onChange, scope = "balance" }) {
  const all = scope === "all";
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open || value) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/orders/search?q=${encodeURIComponent(q)}${all ? "&scope=all" : ""}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (mine === seq.current) setResults(data);
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, value, all]);

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{value.orderNo}</p>
          <p className="truncate font-semibold text-slate-900">{value.customerName}</p>
          {all ? (
            <p className="text-sm text-slate-600">
              Order value: <MoneyText amount={value.netAmount} />
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Balance to receive: <MoneyText amount={value.balance} type="out" />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
          }}
          aria-label="Remove the order link"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white"
        >
          <X size={20} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search by customer, phone or order no."
          aria-label="Search orders"
          autoComplete="off"
          className={`${inputClass} pl-11`}
        />
        {busy && <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          {failed ? (
            <p className="px-4 py-3 text-sm text-red-600">Could not search. Check your connection.</p>
          ) : results && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">{all ? "No orders match." : "No open orders with a balance match."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(results || []).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                    }}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-500">{o.orderNo}</span>
                      <span className="block truncate text-sm font-medium text-slate-900">{o.customerName}</span>
                    </span>
                    {all ? <MoneyText amount={o.netAmount} className="text-sm" /> : <MoneyText amount={o.balance} type="out" className="text-sm" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
