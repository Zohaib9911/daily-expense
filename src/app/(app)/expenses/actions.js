"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Expense from "@/models/Expense";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { createWithAudit, updateWithAudit, voidWithAudit } from "@/lib/audit";
import { dayKey, entryDateFromKey as entryDate } from "@/lib/dates";
import { approvalFields } from "@/lib/expense-status";
import { EXPENSE_SOURCES } from "@/lib/expense-sources";
import { WRITER_ROLES } from "@/lib/nav";
import { uploadExists } from "@/lib/uploads";
import { expenseSchema, fieldErrors } from "@/lib/validation/expense";

// Every action: signed-in admin/manager only (re-checked here, never trusted from the browser),
// validated again with the real Settings, written through the audit helpers.
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

// Expenses made automatically by a staff advance / salary payment are changed only through that record.
function refuseIfAutoCreated(expense) {
  if (expense.sourceType) {
    const src = EXPENSE_SOURCES[expense.sourceType];
    throw new AppError(`This expense was created by ${src?.what || "another record"}. Void that record instead.`, 409);
  }
}

async function validate(input) {
  const settings = await Settings.getSingleton();
  const parsed = expenseSchema(settings).safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { fail: { ok: false, error: Object.values(errors)[0], fieldErrors: errors } };
  }
  const v = parsed.data;
  if (v.receiptUrl && !(await uploadExists(v.receiptUrl))) {
    return {
      fail: {
        ok: false,
        error: "The receipt photo was not found. Please upload it again.",
        fieldErrors: { receiptUrl: "Please upload the photo again" },
      },
    };
  }
  if (v.orderId) {
    const order = await Order.findById(v.orderId).select("_id").lean(); // voided orders are left out by default
    if (!order) {
      return { fail: { ok: false, error: "The order was not found. Choose it again.", fieldErrors: { orderId: "The order was not found" } } };
    }
  }
  return { v, settings };
}

export async function createExpense(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const { v, settings, fail } = await validate(input);
    if (fail) return fail;

    const doc = await createWithAudit(
      Expense,
      {
        category: v.category,
        amount: v.amount,
        paidTo: v.paidTo,
        method: v.method,
        date: entryDate(v.date),
        note: v.note,
        receiptUrl: v.receiptUrl,
        order: v.orderId || undefined,
        ...approvalFields(v.amount, user, settings), // over the limit: manager -> pending, owner -> self-approved
      },
      user
    );
    revalidatePath("/", "layout"); // lists, dashboard totals and the owner's pending badge
    return { ok: true, id: doc.id };
  });
}

export async function updateExpense(id, input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Expense not found", 404);
    const existing = await Expense.findById(id).lean();
    if (!existing) throw new AppError("Expense not found", 404);
    refuseIfAutoCreated(existing);

    const { v, settings, fail } = await validate(input);
    if (fail) return fail;

    const updates = {
      category: v.category,
      amount: v.amount,
      paidTo: v.paidTo,
      method: v.method,
      note: v.note,
      receiptUrl: v.receiptUrl,
      order: v.orderId || null, // null = no order (clears the link)
    };
    // Keep the original time of day unless the day itself changed.
    if (dayKey(existing.date) !== v.date) updates.date = entryDate(v.date);

    // A manager's edit is re-checked against the approval limit; the owner's edits keep the status.
    //  - over the limit and (rejected, or never owner-approved, or amount changed) -> back to pending
    //  - under the limit but not "approved" (pending/rejected) -> approved, nothing to approve
    if (user.role !== "admin") {
      const overLimit = v.amount > settings.approvalRequiredAbove;
      const needsReapproval =
        existing.status === "rejected" ||
        (existing.status === "approved" && (!existing.approvedBy || existing.amount !== v.amount));
      if (overLimit && needsReapproval) {
        updates.status = "pending_approval";
        updates.approvedBy = null;
        updates.approvedAt = null;
        // resubmitted after a rejection: the old rejection stays in the audit history, not on the record
        updates.rejectReason = null;
        updates.rejectedBy = null;
        updates.rejectedAt = null;
      } else if (!overLimit && existing.status !== "approved") {
        updates.status = "approved";
        updates.approvedBy = null;
        updates.approvedAt = null;
      }
    }

    await updateWithAudit(Expense, id, updates, user);
    revalidatePath("/", "layout"); // lists, dashboard totals and the owner's pending badge
    revalidatePath(`/expenses/${id}`);
    return { ok: true, id };
  });
}

export async function voidExpense(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    if (mongoose.isValidObjectId(id)) {
      const existing = await Expense.findById(id).setOptions({ showVoided: true }).lean();
      if (existing) refuseIfAutoCreated(existing);
    }
    await voidWithAudit(Expense, id, reason, user);
    revalidatePath("/", "layout"); // lists, dashboard totals and the owner's pending badge
    revalidatePath(`/expenses/${id}`);
    return { ok: true };
  });
}
