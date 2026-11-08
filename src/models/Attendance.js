import {
  Schema,
  ObjectId,
  addAuditFields,
  addVoidFields,
  addBackdatedFlag,
  getModel,
} from "./_shared.js";

const AttendanceSchema = new Schema(
  {
    staff: { type: ObjectId, ref: "Staff", required: true, index: true },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["present", "absent", "half_day"],
      required: true,
    },
  },
  { timestamps: true }
);
addAuditFields(AttendanceSchema);
addVoidFields(AttendanceSchema);
addBackdatedFlag(AttendanceSchema, "date");

// One live record per staff per day (voided ones don't block a correction).
AttendanceSchema.index(
  { staff: 1, date: 1 },
  { unique: true, partialFilterExpression: { isVoided: false } }
);

export default getModel("Attendance", AttendanceSchema);
