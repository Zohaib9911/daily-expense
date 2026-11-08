"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { recordPurchase, voidPurchase as voidPurchaseRecord } from "@/lib/supplier-money";
import { WRITER_ROLES } from "@/lib/nav";
import { uploadExists } from "@/lib/uploads";
import { fieldErrors } from "@/lib/validation/expense";
import { purchaseSchema } from "@/lib/validation/supplier";

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

function refresh() {
  revalidatePath("/materials");
  revalidatePath("/suppliers", "layout");
  revalidatePath("/expenses");
}

/** Record a material purchase. The amount paid now becomes a raw_material Expense; the rest is supplier due. */
export async function createPurchase(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const settings = await Settings.getSingleton();
    const parsed = purchaseSchema(settings).safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;
    if (v.receiptUrl && !(await uploadExists(v.receiptUrl))) {
      return { ok: false, error: "The bill photo was not found. Please upload it again.", fieldErrors: { receiptUrl: "Please upload the photo again" } };
    }
    const purchase = await recordPurchase(
      { supplierId: v.supplierId, items: v.items, paidAmount: v.paidAmount, method: v.method, dateKey: v.date, receiptUrl: v.receiptUrl, note: v.note },
      user
    );
    refresh();
    return { ok: true, id: purchase.id };
  });
}

export async function voidPurchase(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await voidPurchaseRecord(id, reason, user);
    refresh();
    return { ok: true };
  });
}
