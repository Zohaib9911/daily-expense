import {
  Schema,
  ObjectId,
  PAYMENT_METHODS,
  rupees,
  addAuditFields,
  addVoidFields,
  addBackdatedFlag,
  getModel,
} from "./_shared.js";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCE_TYPES } from "../lib/constants.js";

export { EXPENSE_CATEGORIES };

const ExpenseSchema = new Schema(
  {
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true, index: true },
    amount: rupees({ required: true, min: 1 }),
    paidTo: { type: String, trim: true },
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    date: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, trim: true },
    receiptUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["approved", "pending_approval", "rejected"],
      default: "approved",
      index: true,
    },
    // Set on expenses created automatically by a staff advance / salary / material purchase / supplier payment. Those can only be
    // voided by voiding the source record.
    sourceType: { type: String, enum: EXPENSE_SOURCE_TYPES },
    sourceId: { type: ObjectId, index: true },
    // Optional: the customer order this cost belongs to (pipes, rope, powder coating...). Used for profit/loss per order.
    order: { type: ObjectId, ref: "Order", index: true },
    // Optional labels: which staff member a Salary / Staff Advance expense is for, and which supplier a Raw Material one is for.
    staff: { type: ObjectId, ref: "Staff", index: true },
    supplier: { type: ObjectId, ref: "Supplier", index: true },
    approvedBy: { type: ObjectId, ref: "User" },
    approvedAt: { type: Date },
    // Set when the owner rejects a pending expense.
    rejectReason: { type: String, trim: true },
    rejectedBy: { type: ObjectId, ref: "User" },
    rejectedAt: { type: Date },
  },
  { timestamps: true }
);
addAuditFields(ExpenseSchema);
addVoidFields(ExpenseSchema);
addBackdatedFlag(ExpenseSchema, "date");

export default getModel("Expense", ExpenseSchema);
