import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import { AppError } from "@/lib/auth-helpers";
import { assertDayUnlocked, createWithAudit, logAudit, voidWithAudit } from "@/lib/audit";
import { entryDateFromKey } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

// Server-only. All money that touches an order goes through here, so an order's `advanceReceived`
// (total received) and `balance` always match its payments.

/** Re-derive an order's received/balance from its non-voided payments. Self-healing; returns the new figures. */
export async function syncOrderTotals(orderId) {
  const oid = new mongoose.Types.ObjectId(String(orderId));
  // Payment's default guard already leaves out voided payments.
  const [row] = await Payment.aggregate([{ $match: { order: oid } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  const received = row?.total ?? 0;
  const order = await Order.findById(oid).setOptions({ showVoided: true }).select("netAmount").lean();
  if (!order) throw new AppError("Order not found", 404);
  const figures = { advanceReceived: received, balance: order.netAmount - received };
  await Order.updateOne({ _id: oid }, figures).setOptions({ showVoided: true });
  return figures;
}

/**
 * Record a payment. With `orderId` it is a payment toward that order:
 *   - it can never push the order's received total above its net amount. The check is ONE atomic
 *     database update (not read-then-write), so two people paying at once can't both slip through;
 *   - the order's received/balance are updated and the change is audit-logged.
 * Without `orderId` it is other income. `user` is what requireRole() returns.
 */
export async function recordPayment({ orderId, amount, method, type, dateKey, note = "", receiptUrl = "" }, user) {
  await connectDB();
  const date = entryDateFromKey(dateKey);
  await assertDayUnlocked(user, date, "create"); // fail before touching the order

  let before = null;
  if (orderId) {
    const order = await Order.findById(orderId).setOptions({ showVoided: true }).lean();
    if (!order || order.isVoided) throw new AppError("Order not found", 404);
    if (order.status === "cancelled") throw new AppError("This order is cancelled, so it can't receive payments", 409);

    const reserved = await Order.findOneAndUpdate(
      { _id: orderId, status: { $ne: "cancelled" }, $expr: { $lte: [{ $add: ["$advanceReceived", amount] }, "$netAmount"] } },
      { $inc: { advanceReceived: amount, balance: -amount }, $set: { updatedBy: user.id } },
      { returnDocument: "before" }
    ).lean();

    if (!reserved) {
      // Re-read: the figures read above may be stale if someone else just paid.
      const fresh = await Order.findById(orderId).setOptions({ showVoided: true }).select("netAmount advanceReceived").lean();
      const left = fresh.netAmount - fresh.advanceReceived;
      throw new AppError(
        left > 0
          ? `You can't receive ${formatPKR(amount)}: this order's balance is only ${formatPKR(left)}`
          : "This order has no balance left to receive",
        409
      );
    }
    before = { advanceReceived: reserved.advanceReceived, balance: reserved.balance };
  }

  let payment;
  try {
    payment = await createWithAudit(
      Payment,
      { order: orderId || undefined, amount, method, type, date, note, receiptUrl },
      user
    );
  } catch (err) {
    if (orderId) {
      // give the reserved amount back
      await Order.updateOne({ _id: orderId }, { $inc: { advanceReceived: -amount, balance: amount } }).setOptions({ showVoided: true });
    }
    throw err;
  }

  if (orderId) {
    const after = await syncOrderTotals(orderId);
    await logAudit({ collectionName: "orders", recordId: orderId, action: "update", oldValue: before, newValue: after, user });
  }
  return payment;
}

/** Void a payment and give its amount back to the order's balance. */
export async function voidPayment(paymentId, reason, user) {
  await connectDB();
  if (!mongoose.isValidObjectId(paymentId)) throw new AppError("Payment not found", 404);
  const pay = await Payment.findById(paymentId).setOptions({ showVoided: true }).lean();
  if (!pay) throw new AppError("Payment not found", 404);

  let before = null;
  if (pay.order) {
    before = await Order.findById(pay.order).setOptions({ showVoided: true }).select("advanceReceived balance -_id").lean();
  }

  const doc = await voidWithAudit(Payment, paymentId, reason, user);

  if (pay.order) {
    const after = await syncOrderTotals(pay.order);
    await logAudit({ collectionName: "orders", recordId: pay.order, action: "update", oldValue: before, newValue: after, user });
  }
  return doc;
}
