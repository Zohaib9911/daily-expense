"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { createWithAudit, logAudit } from "@/lib/audit";
import { recordPayment } from "@/lib/order-payments";
import { entryDateFromKey, noonOfKey } from "@/lib/dates";
import { ORDER_TRANSITIONS } from "@/lib/constants";
import { WRITER_ROLES } from "@/lib/nav";
import { fieldErrors } from "@/lib/validation/expense";
import { orderSchema } from "@/lib/validation/order";
import { uploadExists } from "@/lib/uploads";

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

/**
 * Create an order. If an advance was received, a Payment (type order_advance) is created
 * through recordPayment(), the same path "Receive Payment" uses, so order and payment agree.
 */
export async function createOrder(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();

    const parsed = orderSchema.safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;

    // Photos must really be uploaded files (and no repeats).
    const photos = [...new Set(v.photos)];
    for (const url of photos) {
      if (!(await uploadExists(url))) {
        return { ok: false, error: "A photo was not found. Please add it again.", fieldErrors: { photos: "A photo was not found. Please add it again." } };
      }
    }

    const order = await createWithAudit(
      Order,
      {
        customerName: v.customerName,
        customerPhone: v.customerPhone || undefined,
        address: v.address || undefined,
        items: v.items.map((it) => ({ name: it.name, qty: it.qty, rate: it.rate })),
        discount: v.discount,
        advanceReceived: 0, // set by the payment below, never typed in directly
        status: "pending",
        orderDate: entryDateFromKey(v.orderDate),
        deliveryDate: v.deliveryDate ? noonOfKey(v.deliveryDate) : undefined,
        notes: v.notes || undefined,
        photos,
      },
      user
    );

    if (v.advance > 0) {
      try {
        await recordPayment(
          {
            orderId: order.id,
            amount: v.advance,
            method: v.advanceMethod,
            type: "order_advance",
            dateKey: v.orderDate,
            note: "Advance with order",
          },
          user
        );
      } catch (err) {
        if (err instanceof AppError) {
          revalidatePath("/orders");
          return {
            ok: true,
            id: order.id,
            warning: `The order was saved, but the advance was not recorded: ${err.message} Use "Receive Payment" on the order.`,
          };
        }
        throw err;
      }
    }

    revalidatePath("/orders");
    revalidatePath("/payments");
    return { ok: true, id: order.id };
  });
}

/**
 * Move an order to another status. This is NOT blocked by the daily-closing lock: the lock
 * protects the money entries of a closed day, and an order made on a closed day still has to be
 * produced and delivered later. The change is audit-logged.
 */
export async function changeOrderStatus(id, status) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Order not found", 404);

    const order = await Order.findById(id).setOptions({ showVoided: true });
    if (!order || order.isVoided) throw new AppError("Order not found", 404);
    if (!(ORDER_TRANSITIONS[order.status] || []).includes(status)) {
      throw new AppError(`An order that is ${order.status.replace("_", " ")} can't be changed to ${String(status).replace("_", " ")}`, 409);
    }

    const oldValue = { status: order.status };
    order.status = status;
    order.updatedBy = user.id;
    await order.save();
    await logAudit({ collectionName: "orders", recordId: order._id, action: "update", oldValue, newValue: { status }, user });

    revalidatePath("/orders");
    revalidatePath(`/orders/${id}`);
    return { ok: true };
  });
}
