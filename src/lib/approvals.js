import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Expense from "@/models/Expense";
import { AppError } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { EXPENSE_SOURCES } from "@/lib/expense-sources";

// Server-only. Owner approval of expenses that went over Settings.approvalRequiredAbove.
// Until approved, an expense is NOT counted in any total (dashboard, reports, expense list total). Approving
// counts it; rejecting keeps it out for good. Both are written to the audit log (actions "approve" / "reject").
// Owner-only is enforced by the callers (server actions use requireRole(["admin"])).

/** How many expenses are waiting (shown as the red badge in the navigation). */
export async function pendingApprovalCount() {
  await connectDB();
  return Expense.countDocuments({ status: "pending_approval" }); // voided ones are left out by default
}

async function loadPending(id) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) throw new AppError("Expense not found", 404);
  const doc = await Expense.findById(id).setOptions({ showVoided: true });
  if (!doc || doc.isVoided) throw new AppError("Expense not found", 404);
  if (doc.status !== "pending_approval") {
    throw new AppError(doc.status === "approved" ? "This expense was already approved" : "This expense was already rejected", 409);
  }
  return doc;
}

export async function approveExpense(id, user) {
  const doc = await loadPending(id);
  doc.status = "approved";
  doc.approvedBy = user.id;
  doc.approvedAt = new Date();
  doc.updatedBy = user.id;
  await doc.save();
  await logAudit({
    collectionName: Expense.collection.name,
    recordId: doc._id,
    action: "approve",
    oldValue: { status: "pending_approval", amount: doc.amount },
    newValue: { status: "approved", amount: doc.amount, approvedBy: user.id, approvedAt: doc.approvedAt },
    user,
  });
  return doc;
}

export async function rejectExpense(id, reason, user) {
  const why = String(reason || "").trim();
  if (why.length < 5) throw new AppError("A reason of at least 5 characters is required to reject an expense", 400);
  const doc = await loadPending(id);
  if (doc.sourceType) {
    // The record that created it (salary payment, advance, purchase, supplier payment) stays; rejecting only the
    // expense would leave the books inconsistent, so the owner voids the source record instead.
    const src = EXPENSE_SOURCES[doc.sourceType];
    throw new AppError(`This expense was created by ${src?.what || "another record"}. To decline it, ${src?.fix || "void that record"}.`, 409);
  }
  doc.status = "rejected";
  doc.rejectReason = why;
  doc.rejectedBy = user.id;
  doc.rejectedAt = new Date();
  doc.updatedBy = user.id;
  await doc.save();
  await logAudit({
    collectionName: Expense.collection.name,
    recordId: doc._id,
    action: "reject",
    oldValue: { status: "pending_approval", amount: doc.amount },
    newValue: { status: "rejected", amount: doc.amount, rejectReason: why, rejectedBy: user.id, rejectedAt: doc.rejectedAt },
    user,
  });
  return doc;
}
