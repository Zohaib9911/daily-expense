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
import { MATERIAL_UNITS } from "../lib/constants.js";

const ItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: MATERIAL_UNITS, default: "pcs" },
    rate: rupees({ required: true }),
    total: rupees(), // computed: round(qty * rate)
  },
  { _id: false }
);

const MaterialPurchaseSchema = new Schema(
  {
    supplier: { type: ObjectId, ref: "Supplier", required: true, index: true },
    items: { type: [ItemSchema], default: [] },
    totalAmount: rupees(), // computed: sum of items
    paidAmount: rupees(), // paid at purchase time (creates a raw_material Expense)
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" }, // how paidAmount was paid
    expense: { type: ObjectId, ref: "Expense" }, // the Expense for paidAmount (none when nothing was paid)
    dueAmount: rupees({ min: undefined }), // computed: totalAmount - paidAmount
    date: { type: Date, required: true, default: Date.now, index: true },
    receiptUrl: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);
addAuditFields(MaterialPurchaseSchema);
addVoidFields(MaterialPurchaseSchema);
addBackdatedFlag(MaterialPurchaseSchema, "date");

MaterialPurchaseSchema.pre("validate", function () {
  for (const it of this.items) it.total = Math.round(it.qty * it.rate);
  this.totalAmount = this.items.reduce((s, it) => s + it.total, 0);
  this.dueAmount = this.totalAmount - (this.paidAmount || 0);
});

export default getModel("MaterialPurchase", MaterialPurchaseSchema);
