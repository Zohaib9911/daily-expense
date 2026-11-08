import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { METHOD_LABELS } from "@/lib/constants";
import { thumbUrl } from "@/lib/validation/expense";
import { getShopName } from "@/lib/shop";
import { btnGhost } from "@/lib/ui";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import PrintButton from "./PrintButton";

export const metadata = { title: "Invoice" };

// Printable invoice. The app chrome (top bar, menus) has `print:hidden`, so printing or
// "Save as PDF" from the browser gives just this sheet.
export default async function InvoicePage({ params }) {
  const { id } = await params;
  await requirePageUser();
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const o = await Order.findById(id).lean();
  if (!o) notFound();
  const [payments, shopName] = await Promise.all([
    Payment.find({ order: o._id }).sort({ date: 1 }).lean(), // voided payments are left out
    getShopName(),
  ]);
  const balance = o.netAmount - o.advanceReceived;

  return (
    <div className="space-y-4">
      {/* Zero page margin = the browser has no room for its own header and footer (date, title, page address),
          so the printout is just the invoice. The article adds its own 14 mm padding when printing. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <div className="space-y-2 print:hidden">
        <PrintButton />
        <Link href={`/orders/${id}`} className={`${btnGhost} min-h-12 w-full`}>
          Back to order
        </Link>
      </div>

      <article className="rounded-2xl bg-white p-5 text-slate-900 shadow-sm print:rounded-none print:p-[14mm] print:shadow-none">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold">{shopName}</h2>
            <p className="text-sm text-slate-500">Invoice</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">{o.orderNo}</p>
            <p className="text-slate-500">{formatDate(o.orderDate)}</p>
          </div>
        </header>

        <section className="border-b border-slate-200 py-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Billed to</p>
          <p className="break-words font-semibold">{o.customerName}</p>
          {o.customerPhone && <p>{o.customerPhone}</p>}
          {o.address && <p className="break-words text-slate-600">{o.address}</p>}
          {o.deliveryDate && <p className="mt-2 text-slate-600">Delivery: {formatDate(o.deliveryDate)}</p>}
        </section>

        <section className="border-b border-slate-200 py-2">
          <ul className="divide-y divide-slate-100">
            {o.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium">{it.name}</p>
                  <p className="text-xs text-slate-500">
                    {it.qty} × {formatPKR(it.rate)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatPKR(it.total)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1.5 py-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Total</span><span className="tabular-nums">{formatPKR(o.totalAmount)}</span></div>
          {o.discount > 0 && (
            <div className="flex justify-between"><span className="text-slate-600">Discount</span><span className="tabular-nums">-{formatPKR(o.discount)}</span></div>
          )}
          <div className="flex justify-between text-base font-bold"><span>Net amount</span><span className="tabular-nums">{formatPKR(o.netAmount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Received</span><span className="tabular-nums">{formatPKR(o.advanceReceived)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
            <span>{balance > 0 ? "Balance due" : "Balance"}</span>
            <span className="tabular-nums">{balance > 0 ? formatPKR(balance) : "Paid in full"}</span>
          </div>
        </section>

        {payments.length > 0 && (
          <section className="border-t border-slate-200 pt-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Payments received</p>
            <ul className="space-y-1">
              {payments.map((p) => (
                <li key={String(p._id)} className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    {formatDate(p.date)} · {METHOD_LABELS[p.method]}
                  </span>
                  <span className="tabular-nums">{formatPKR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {o.notes && <p className="mt-4 break-words border-t border-slate-200 pt-3 text-sm text-slate-600">Notes: {o.notes}</p>}
        <p className="mt-6 text-center text-xs text-slate-500">Thank you for your business!</p>
        {o.photos?.length > 0 && (
          <section className="mt-5 break-inside-avoid border-t border-slate-200 pt-3">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">Photos</p>
            {/* small on purpose: about 2.5 cm square on paper */}
            <ul className="flex flex-wrap gap-2">
              {o.photos.map((url, i) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(url)} alt={`Furniture photo ${i + 1}`} className="h-20 w-20 rounded-md border border-slate-200 object-cover print:h-[2.5cm] print:w-[2.5cm]" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
