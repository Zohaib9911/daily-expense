import { Schema, ObjectId, getModel } from "./_shared.js";

// Append-only trail. Written by server code on every create/update/void/approve/reject (and "export" for data backups).
const AuditLogSchema = new Schema(
  {
    collectionName: { type: String, required: true, index: true },
    recordId: { type: ObjectId, required: true, index: true },
    action: {
      type: String,
      enum: ["create", "update", "void", "approve", "reject", "export"],
      required: true,
      index: true,
    },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    user: { type: ObjectId, ref: "User", index: true },
    userName: { type: String, trim: true },
    ip: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

AuditLogSchema.index({ collectionName: 1, recordId: 1, timestamp: -1 });

export default getModel("AuditLog", AuditLogSchema);
