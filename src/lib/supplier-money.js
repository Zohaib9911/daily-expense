import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Expense from "@/models/Expense";
import MaterialPurchase from "@/models/MaterialPurchase";
import Settings from "@/models/Settings";
import Supplier from "@/models/Supplier";
import SupplierPayment from "@/models/SupplierPayment";
import { AppError } from "@/lib/auth-helpers";
import { assertDayUnlocked, createWithAudit, voidWithAudit } from "@/lib/audit";
import { entryDateFromKey } from "@/lib/dates";
import { approvalFields } from "@/lib/expense-status";

// Server-only. Supplier khata (ledger) and the money flows around it:
//   recordPurchase      -> MaterialPurchase (+ Expense raw_material for the amount paid now)
//   paySupplier         -> SupplierPayment  + Expense raw_material
// Each creates at most ONE Expense, linked back via sourceType/sourceId, and voiding the purchase or
// payment voids that Expense. The unpaid rest of a purchase is NOT an expense: it is a supplier due,
// and becomes an expense only when it is paid (as a SupplierPayment).
//
// Balance = opening + sum(purchase totals) - sum(paid at purchase) - sum(supplier payments)
//   > 0  we owe the supplier (shown red)      < 0  the supplier holds our advance (green)


/** Map of supplierId -> { purchased, paidAtPurchase, paid, due } for the given supplier docs (lean, with openingBalance). */
export async function balancesFor(suppliers) {
  if (!suppliers.length) return new Map();
  const ids = suppliers.map((s) => s._id);
  const [purchases, payments] = await Promise.all([
    // Voided records are left out by default.
    MaterialPurchase.aggregate([
      { $match: { supplier: { $in: ids } } },
      { $group: { _id: "$supplier", purchased: { $sum: "$totalAmount" }, paidAtPurchase: { $sum: "$paidAmount" } } },
    ]),
    SupplierPayment.aggregate([{ $match: { supplier: { $in: ids } } }, { $group: { _id: "$supplier", paid: { $sum: "$amount" } } }]),
  ]);
  const p = new Map(purchases.map((r) => [String(r._id), r]));
  const q = new Map(payments.map((r) => [String(r._id), r.paid]));
  return new Map(
    suppliers.map((s) => {
      const purchased = p.get(String(s._id))?.purchased ?? 0;
      const paidAtPurchase = p.get(String(s._id))?.paidAtPurchase ?? 0;
      const paid = q.get(String(s._id)) ?? 0;
      return [String(s._id), { purchased, paidAtPurchase, paid, due: (s.openingBalance || 0) + purchased - paidAtPurchase - paid }];
    })
  );
}

/**
 * The khata: every purchase (debit), amount paid at purchase and supplier payment (credit), in date
 * order, each with the running balance after it. Voided entries are included for the record but
 * don't count. Returns { opening, entries (oldest first), totals }.
 */
export async function ledgerFor(supplier) {
  const [purchases, payments] = await Promise.all([
    MaterialPurchase.find({ supplier: supplier._id }).setOptions({ showVoided: true }).lean(),
    SupplierPayment.find({ supplier: supplier._id }).setOptions({ showVoided: true }).lean(),
  ]);

  const raw = [];
  for (const p of purchases) {
    raw.push({ kind: "purchase", id: String(p._id), date: p.date, createdAt: p.createdAt, order: 0, debit: p.totalAmount, credit: 0, voided: p.isVoided, items: p.items.length, summary: p.items.map((i) => i.name).join(", "), backdated: p.isBackdated, hasBill: !!p.receiptUrl });
    if (p.paidAmount > 0) {
      raw.push({ kind: "paid_at_purchase", id: String(p._id), date: p.date, createdAt: p.createdAt, order: 1, debit: 0, credit: p.paidAmount, voided: p.isVoided, method: p.method });
    }
  }
  for (const p of payments) {
    raw.push({ kind: "payment", id: String(p._id), date: p.date, createdAt: p.createdAt, order: 2, debit: 0, credit: p.amount, voided: p.isVoided, method: p.method, note: p.note || "", backdated: p.isBackdated });
  }
  raw.sort((a, b) => a.date - b.date || a.createdAt - b.createdAt || a.order - b.order);

  const opening = supplier.openingBalance || 0;
  let balance = opening;
  let debit = 0;
  let credit = 0;
  const entries = raw.map((e) => {
    if (!e.voided) {
      balance += e.debit - e.credit;
      debit += e.debit;
      credit += e.credit;
    }
    return { ...e, balance };
  });
  return { opening, entries, totals: { debit, credit, balance } };
}

/* ----------------------------------------------------------------- purchase */

export async function recordPurchase({ supplierId, items, paidAmount = 0, method = "cash", dateKey, receiptUrl = "", note = "" }, user) {
  await connectDB();
  const supplier = await Supplier.findById(supplierId).lean();
  if (!supplier) throw new AppError("Supplier not found", 404);
  if (!supplier.active) throw new AppError("This supplier is not active", 409);

  const date = entryDateFromKey(dateKey);
  await assertDayUnlocked(user, date, "create"); // fail before creating anything
  const settings = await Settings.getSingleton();

  const purchase = await createWithAudit(
    MaterialPurchase,
    {
      supplier: supplier._id,
      items: items.map((it) => ({ name: it.name, qty: it.qty, unit: it.unit, rate: it.rate })),
      paidAmount,
      method,
      date,
      receiptUrl: receiptUrl || undefined,
      note: note || undefined,
    },
    user
  );

  if (paidAmount > 0) {
    try {
      const expense = await createWithAudit(
        Expense,
        {
          category: "raw_material",
          amount: paidAmount,
          paidTo: supplier.name,
          method,
          date,
          note: `Purchase from ${supplier.name}${note ? `: ${note}` : ""}`,
          receiptUrl: receiptUrl || undefined,
          sourceType: "material_purchase",
          sourceId: purchase._id,
          ...approvalFields(paidAmount, user, settings),
        },
        user
      );
      await MaterialPurchase.updateOne({ _id: purchase._id }, { expense: expense._id });
    } catch (err) {
      await voidWithAudit(MaterialPurchase, purchase.id, "Automatically voided: the linked expense could not be created", user).catch(() => {});
      throw err;
    }
  }
  return purchase;
}

export async function voidPurchase(purchaseId, reason, user) {
  await connectDB();
  if (!mongoose.isValidObjectId(purchaseId)) throw new AppError("Purchase not found", 404);
  const p = await MaterialPurchase.findById(purchaseId).setOptions({ showVoided: true }).lean();
  if (!p) throw new AppError("Purchase not found", 404);
  const doc = await voidWithAudit(MaterialPurchase, purchaseId, reason, user);
  if (p.expense) await voidWithAudit(Expense, p.expense, `Purchase voided: ${reason}`, user);
  return doc;
}

/* ------------------------------------------------------------------ payment */

export async function paySupplier({ supplierId, amount, method, dateKey, note = "" }, user) {
  await connectDB();
  const supplier = await Supplier.findById(supplierId).lean();
  if (!supplier) throw new AppError("Supplier not found", 404);

  const date = entryDateFromKey(dateKey);
  await assertDayUnlocked(user, date, "create");
  const settings = await Settings.getSingleton();

  const payment = await createWithAudit(SupplierPayment, { supplier: supplier._id, amount, method, date, note: note || undefined }, user);
  try {
    const expense = await createWithAudit(
      Expense,
      {
        category: "raw_material",
        amount,
        paidTo: supplier.name,
        method,
        date,
        note: `Payment to ${supplier.name}${note ? `: ${note}` : ""}`,
        sourceType: "supplier_payment",
        sourceId: payment._id,
        ...approvalFields(amount, user, settings),
      },
      user
    );
    await SupplierPayment.updateOne({ _id: payment._id }, { expense: expense._id });
  } catch (err) {
    await voidWithAudit(SupplierPayment, payment.id, "Automatically voided: the linked expense could not be created", user).catch(() => {});
    throw err;
  }
  return payment;
}

export async function voidSupplierPayment(paymentId, reason, user) {
  await connectDB();
  if (!mongoose.isValidObjectId(paymentId)) throw new AppError("Payment not found", 404);
  const p = await SupplierPayment.findById(paymentId).setOptions({ showVoided: true }).lean();
  if (!p) throw new AppError("Payment not found", 404);
  const doc = await voidWithAudit(SupplierPayment, paymentId, reason, user);
  if (p.expense) await voidWithAudit(Expense, p.expense, `Supplier payment voided: ${reason}`, user);
  return doc;
}

