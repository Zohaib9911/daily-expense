import {
  Schema,
  rupees,
  addAuditFields,
  addVoidFields,
  addBackdatedFlag,
  getModel,
} from "./_shared.js";
import { nextSequence } from "./Counter.js";

const ItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 0 },
    rate: rupees({ required: true }),
    total: rupees(), // computed: round(qty * rate)
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    orderNo: { type: String, unique: true, index: true }, // ORD-0001, auto
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true },
    address: { type: String, trim: true },
    items: { type: [ItemSchema], default: [] },
    totalAmount: rupees(), // computed: sum of items
    discount: rupees(),
    netAmount: rupees(), // computed: totalAmount - discount
    advanceReceived: rupees(),
    balance: rupees({ min: undefined }), // computed: netAmount - advanceReceived
    status: {
      type: String,
      enum: ["pending", "in_production", "ready", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    orderDate: { type: Date, required: true, default: Date.now, index: true },
    deliveryDate: { type: Date, index: true },
    notes: { type: String, trim: true },
    // Optional photos of the furniture ordered (/api/files/receipts/... URLs from /api/upload).
    photos: { type: [String], default: [] },
  },
  { timestamps: true }
);
addAuditFields(OrderSchema);
addVoidFields(OrderSchema);
addBackdatedFlag(OrderSchema, "orderDate");

OrderSchema.index({ customerPhone: 1 });

OrderSchema.pre("validate", async function () {
  if (this.isNew && !this.orderNo) {
    const n = await nextSequence("order");
    this.orderNo = `ORD-${String(n).padStart(4, "0")}`;
  }
  for (const it of this.items) it.total = Math.round(it.qty * it.rate);
  this.totalAmount = this.items.reduce((s, it) => s + it.total, 0);
  this.netAmount = this.totalAmount - (this.discount || 0);
  this.balance = this.netAmount - (this.advanceReceived || 0);
});

export default getModel("Order", OrderSchema);
