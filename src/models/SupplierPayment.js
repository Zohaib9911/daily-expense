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

const SupplierPaymentSchema = new Schema(
  {
    supplier: { type: ObjectId, ref: "Supplier", required: true, index: true },
    amount: rupees({ required: true, min: 1 }),
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    date: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, trim: true },
    expense: { type: ObjectId, ref: "Expense" }, // the raw_material Expense created with this payment
  },
  { timestamps: true }
);
addAuditFields(SupplierPaymentSchema);
addVoidFields(SupplierPaymentSchema);
addBackdatedFlag(SupplierPaymentSchema, "date");

export default getModel("SupplierPayment", SupplierPaymentSchema);
