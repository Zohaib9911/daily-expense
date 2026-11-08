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

// Cash In
const PaymentSchema = new Schema(
  {
    order: { type: ObjectId, ref: "Order", index: true }, // optional
    amount: rupees({ required: true, min: 1 }),
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    type: {
      type: String,
      enum: ["order_advance", "order_balance", "other_income"],
      required: true,
      index: true,
    },
    date: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, trim: true },
    receiptUrl: { type: String, trim: true },
  },
  { timestamps: true }
);
addAuditFields(PaymentSchema);
addVoidFields(PaymentSchema);
addBackdatedFlag(PaymentSchema, "date");

export default getModel("Payment", PaymentSchema);
