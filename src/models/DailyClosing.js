import {
  Schema,
  ObjectId,
  rupees,
  addAuditFields,
  addVoidFields,
  getModel,
} from "./_shared.js";

const DailyClosingSchema = new Schema(
  {
    date: { type: Date, required: true }, // Karachi calendar day, stored at noon Karachi
    openingBalance: rupees({ min: undefined }),
    totalIn: rupees(),
    totalOut: rupees(),
    expectedClosing: rupees({ min: undefined }), // computed: opening + in - out
    actualCounted: rupees({ required: true }),
    difference: rupees({ min: undefined }), // computed: actualCounted - expectedClosing
    note: { type: String, trim: true },
    closedBy: { type: ObjectId, ref: "User", index: true },
    isLocked: { type: Boolean, default: false },
    // Filled when the owner reopens a closed day (the audit log keeps every unlock too).
    unlockReason: { type: String, trim: true },
    unlockedBy: { type: ObjectId, ref: "User" },
    unlockedAt: { type: Date },
  },
  { timestamps: true }
);
addAuditFields(DailyClosingSchema);
addVoidFields(DailyClosingSchema);

// Unique per day among live records (a voided closing can be redone).
DailyClosingSchema.index(
  { date: 1 },
  { unique: true, partialFilterExpression: { isVoided: false } }
);

DailyClosingSchema.pre("validate", function () {
  this.expectedClosing = this.openingBalance + this.totalIn - this.totalOut;
  this.difference = this.actualCounted - this.expectedClosing;
});

export default getModel("DailyClosing", DailyClosingSchema);
