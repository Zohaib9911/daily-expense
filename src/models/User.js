import { Schema, addAuditFields, getModel } from "./_shared.js";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "manager", "viewer"],
      required: true,
      default: "viewer",
    },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
addAuditFields(UserSchema);

export default getModel("User", UserSchema);
