"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Supplier from "@/models/Supplier";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { createWithAudit, updateWithAudit } from "@/lib/audit";
import { paySupplier as paySupplierRecord, voidSupplierPayment as voidSupplierPaymentRecord } from "@/lib/supplier-money";
import { WRITER_ROLES } from "@/lib/nav";
import { fieldErrors } from "@/lib/validation/expense";
import { supplierPaymentSchema, supplierSchema } from "@/lib/validation/supplier";

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

function parseSupplier(input) {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { fail: { ok: false, error: Object.values(errors)[0], fieldErrors: errors } };
  }
  const v = parsed.data;
  return {
    data: {
      name: v.name,
      phone: v.phone || undefined,
      address: v.address || undefined,
      // stored as a signed number: positive = we owe them, negative = they hold our advance
      openingBalance: v.openingDirection === "they_owe" ? -v.openingBalance : v.openingBalance,
      active: v.active,
    },
  };
}

export async function createSupplier(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const { data, fail } = parseSupplier({ ...input, active: true });
    if (fail) return fail;
    const doc = await createWithAudit(Supplier, data, user);
    revalidatePath("/suppliers");
    return { ok: true, id: doc.id };
  });
}

export async function updateSupplier(id, input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Supplier not found", 404);
    const { data, fail } = parseSupplier(input);
    if (fail) return fail;
    const updates = { ...data };
    for (const k of ["phone", "address"]) if (updates[k] === undefined) updates[k] = null; // cleared fields
    await updateWithAudit(Supplier, id, updates, user);
    revalidatePath("/suppliers", "layout");
    return { ok: true, id };
  });
}

/** Pay a supplier. Creates the SupplierPayment and its raw_material Expense (see src/lib/supplier-money.js). */
export async function paySupplier(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    const parsed = supplierPaymentSchema.safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;
    const payment = await paySupplierRecord({ supplierId: v.supplierId, amount: v.amount, method: v.method, dateKey: v.date, note: v.note }, user);
    revalidatePath("/suppliers", "layout");
    revalidatePath("/expenses");
    return { ok: true, id: payment.id, supplierId: v.supplierId };
  });
}

export async function voidSupplierPayment(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await voidSupplierPaymentRecord(id, reason, user);
    revalidatePath("/suppliers", "layout");
    revalidatePath("/expenses");
    return { ok: true };
  });
}
