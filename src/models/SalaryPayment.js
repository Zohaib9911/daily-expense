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

const SalaryPaymentSchema = new Schema(
  {
    staff: { type: ObjectId, ref: "Staff", required: true, index: true },
    month: {
      type: String,
      required: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"],
      index: true,
    },
    grossAmount: rupees({ required: true }),
    daysWorked: { type: Number, min: 0 },
    advanceDeducted: rupees(),
    bonus: rupees(),
    otherDeduction: rupees(),
    netPaid: rupees(), // computed: gross + bonus - advanceDeducted - otherDeduction
    date: { type: Date, required: true, default: Date.now, index: true },
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    expense: { type: ObjectId, ref: "Expense" }, // the salary expense created with this payment (none when netPaid is 0)
    // Which advances this payment's advanceDeducted was taken from (oldest first), so a void can undo it exactly.
    advanceAllocations: {
      type: [new Schema({ advance: { type: ObjectId, ref: "StaffAdvance", required: true }, amount: rupees({ min: 1 }) }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);
addAuditFields(SalaryPaymentSchema);
addVoidFields(SalaryPaymentSchema);
addBackdatedFlag(SalaryPaymentSchema, "date");

SalaryPaymentSchema.index({ staff: 1, month: 1 });

SalaryPaymentSchema.pre("validate", function () {
  this.netPaid =
    this.grossAmount + (this.bonus || 0) - (this.advanceDeducted || 0) - (this.otherDeduction || 0);
});

export default getModel("SalaryPayment", SalaryPaymentSchema);
