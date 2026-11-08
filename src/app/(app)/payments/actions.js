"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { recordPayment, voidPayment as voidPaymentAndSync } from "@/lib/order-payments";
import { WRITER_ROLES } from "@/lib/nav";
import { uploadExists } from "@/lib/uploads";
import { fieldErrors } from "@/lib/validation/expense";
import { paymentSchema } from "@/lib/validation/payment";

async function run(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err?.name === "ValidationError") {
      return { ok: false, error: Object.values(err.errors)[0]?.message || "Invalid data" };
    }
    throw err;
  }
}

/** Receive a payment (cash in), optionally toward an order. Re-validated here with the order's CURRENT balance. */
export async function createPayment(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();

    // Look up the linked order first so the schema can check the amount against its real balance.
    let balance = null;
    const orderId = typeof input?.orderId === "string" ? input.orderId : "";
    if (orderId) {
      if (!mongoose.isValidObjectId(orderId)) throw new AppError("Order not found", 404);
      const order = await Order.findById(orderId).select("netAmount advanceReceived status").lean();
      if (!order) throw new AppError("Order not found", 404);
      balance = order.status === "cancelled" ? 0 : order.netAmount - order.advanceReceived;
    }

    const parsed = paymentSchema({ balance }).safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;
    if (v.receiptUrl && !(await uploadExists(v.receiptUrl))) {
      return {
        ok: false,
        error: "The receipt photo was not found. Please upload it again.",
        fieldErrors: { receiptUrl: "Please upload the photo again" },
      };
    }

    // The atomic overpayment guard lives in recordPayment (it also covers two people paying at once).
    const payment = await recordPayment(
      { orderId: v.orderId || null, amount: v.amount, method: v.method, type: v.type, dateKey: v.date, note: v.note, receiptUrl: v.receiptUrl },
      user
    );

    revalidatePath("/payments");
    revalidatePath("/orders");
    if (v.orderId) revalidatePath(`/orders/${v.orderId}`);
    return { ok: true, id: payment.id, orderId: v.orderId || null };
  });
}

export async function voidPayment(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    const doc = await voidPaymentAndSync(id, reason, user);
    revalidatePath("/payments");
    revalidatePath(`/payments/${id}`);
    revalidatePath("/orders");
    if (doc.order) revalidatePath(`/orders/${doc.order}`);
    return { ok: true };
  });
}
