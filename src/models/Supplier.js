import { Schema, rupees, addAuditFields, getModel } from "./_shared.js";

// Master record: never deleted, deactivate with `active: false`.
const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    openingBalance: rupees({ min: undefined }), // what we owed at start (can be negative = advance)
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
addAuditFields(SupplierSchema);

export default getModel("Supplier", SupplierSchema);
