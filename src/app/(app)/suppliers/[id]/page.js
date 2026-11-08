import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, Phone, ShoppingBasket, Wallet } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusBadge from "@/components/ui/StatusBadge";
import VoidRecordButton from "@/components/VoidRecordButton";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { METHOD_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { WRITER_ROLES } from "@/lib/nav";
import { getShopName } from "@/lib/shop";
import { buildLedgerMessage } from "@/lib/supplier-share";
import { ledgerFor } from "@/lib/supplier-money";
import { whatsappLink } from "@/lib/order-share";
import { btnGhost, btnPrimary } from "@/lib/ui";
import Supplier from "@/models/Supplier";
import { voidPurchase } from "../../materials/actions";
import { voidSupplierPayment } from "../actions";

export const metadata = { title: "Supplier" };

const SHOWN = 100; // newest entries shown; balances are always computed over the full history

export default async function SupplierLedgerPage({ params }) {
  const { id } = await params;
  const user = await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const s = await Supplier.findById(id).lean();
  if (!s) notFound();

  const [ledger, shopName] = await Promise.all([ledgerFor(s), getShopName()]);
  const { opening, entries, totals } = ledger;
  const newestFirst = [...entries].reverse();
  const shown = newestFirst.slice(0, SHOWN);
  const writer = WRITER_ROLES.includes(user.role);
  const balance = totals.balance;
  const share = whatsappLink(s.phone, buildLedgerMessage(shopName, s, ledger));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-slate-900">{s.name}</h2>
            {s.address && <p className="break-words text-sm text-slate-500">{s.address}</p>}
          </div>
          {!s.active && <StatusBadge status="inactive" />}
        </div>
        {s.phone && (
          <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-blue-900">
            <Phone size={16} />
            {s.phone}
          </a>
        )}
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{balance < 0 ? "Advance with supplier" : "Balance due to supplier"}</p>
          {balance > 0 ? (
            <MoneyText amount={balance} type="out" className="text-3xl" />
          ) : balance < 0 ? (
            <span className="text-3xl font-bold text-green-600">{formatPKR(-balance)}</span>
          ) : (
            <span className="text-3xl font-bold text-slate-400">Settled</span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Bought (debit)</dt>
            <dd className="font-semibold text-red-600">{formatPKR(totals.debit)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid (credit)</dt>
            <dd className="font-semibold text-green-600">{formatPKR(totals.credit)}</dd>
          </div>
        </dl>
      </Card>

      {writer && (
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/materials/new?supplier=${id}`} className={`${btnPrimary} min-h-12`}>
            <ShoppingBasket size={18} />
            New purchase
          </Link>
          <Link href={`/suppliers/pay?supplier=${id}`} className={`${btnGhost} min-h-12`}>
            <Wallet size={18} />
            Pay supplier
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <a href={share} target="_blank" rel="noopener noreferrer" className={`${btnGhost} min-h-12 !border-green-600 !text-green-700`}>
          <MessageCircle size={18} />
          WhatsApp
        </a>
        {writer ? (
          <Link href={`/suppliers/${id}/edit`} className={`${btnGhost} min-h-12`}>
            <Pencil size={18} />
            Edit
          </Link>
        ) : (
          <span />
        )}
      </div>

      <Card title="Ledger (khata)">
        {entries.length === 0 && opening === 0 ? (
          <p className="text-sm text-slate-500">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((e, i) => (
              <li key={`${e.kind}-${e.id}-${i}`} className={`py-3 ${e.voided ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{formatDate(e.date)}</p>
                    {e.kind === "purchase" && (
                      <Link href={`/materials/${e.id}`} className="block min-h-11 break-words py-0.5 text-sm font-medium text-slate-900 hover:underline">
                        Purchase · {e.items} {e.items === 1 ? "item" : "items"}
                        <span className="block text-xs font-normal text-slate-500">{e.summary}</span>
                      </Link>
                    )}
                    {e.kind === "paid_at_purchase" && <p className="text-sm font-medium text-slate-900">Paid with purchase · {METHOD_LABELS[e.method]}</p>}
                    {e.kind === "payment" && (
                      <p className="break-words text-sm font-medium text-slate-900">
                        Payment · {METHOD_LABELS[e.method]}
                        {e.note && <span className="block text-xs font-normal text-slate-500">{e.note}</span>}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {e.debit > 0 && <MoneyText amount={e.debit} type="out" className={e.voided ? "line-through" : ""} />}
                    {e.credit > 0 && <MoneyText amount={e.credit} type="in" className={e.voided ? "line-through" : ""} />}
                    {!e.voided && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Bal {e.balance < 0 ? `-${formatPKR(-e.balance)} adv` : formatPKR(e.balance)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {e.voided && <StatusBadge status="voided" />}
                  {e.backdated && !e.voided && <StatusBadge status="backdated" label="Backdated" />}
                  {writer && !e.voided && e.kind === "purchase" && (
                    <VoidRecordButton action={voidPurchase} successMessage="Purchase voided" id={e.id} title="Void this purchase?" description={`${formatPKR(e.debit)} purchase from ${s.name}. Its payment expense (if any) is voided too.`} />
                  )}
                  {writer && !e.voided && e.kind === "payment" && (
                    <VoidRecordButton action={voidSupplierPayment} successMessage="Supplier payment voided" id={e.id} title="Void this payment?" description={`${formatPKR(e.credit)} payment to ${s.name}. Its expense is voided too.`} />
                  )}
                </div>
              </li>
            ))}
            {newestFirst.length > SHOWN && <li className="py-3 text-center text-xs text-slate-500">Showing the latest {SHOWN} entries. Balances include everything.</li>}
            <li className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium text-slate-900">Opening balance</span>
              <span className="text-sm font-semibold">
                {opening < 0 ? <span className="text-green-600">{formatPKR(-opening)} advance</span> : opening > 0 ? <span className="text-red-600">{formatPKR(opening)}</span> : "Rs 0"}
              </span>
            </li>
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Newest first. &quot;Bal&quot; is the running balance after each entry: red = you owe the supplier.</p>
      </Card>
    </div>
  );
}
