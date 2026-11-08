import { Schema, rupees, addAuditFields, getModel } from "./_shared.js";

// Master record: never deleted, deactivate with `active: false`.
const StaffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true },
    cnic: { type: String, trim: true },
    role: { type: String, trim: true }, // job role, e.g. "carpenter"
    wageType: { type: String, enum: ["monthly", "daily"], required: true },
    wageAmount: rupees({ required: true }),
    joinDate: { type: Date, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
addAuditFields(StaffSchema);

export default getModel("Staff", StaffSchema);
