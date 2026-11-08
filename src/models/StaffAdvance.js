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

const StaffAdvanceSchema = new Schema(
  {
    staff: { type: ObjectId, ref: "Staff", required: true, index: true },
    amount: rupees({ required: true, min: 1 }),
    date: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, trim: true },
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    expense: { type: ObjectId, ref: "Expense" }, // the staff_advance expense created with this advance
    recoveredAmount: rupees(), // total deducted from salaries so far
    isFullyRecovered: { type: Boolean, default: false, index: true }, // computed
  },
  { timestamps: true }
);
addAuditFields(StaffAdvanceSchema);
addVoidFields(StaffAdvanceSchema);
addBackdatedFlag(StaffAdvanceSchema, "date");

StaffAdvanceSchema.pre("validate", function () {
  this.isFullyRecovered = this.recoveredAmount >= this.amount;
});

export default getModel("StaffAdvance", StaffAdvanceSchema);
