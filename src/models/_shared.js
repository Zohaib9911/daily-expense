import mongoose from "mongoose";
import { TIMEZONE, dayKey, todayKarachi, isBackdated } from "../lib/dates.js";

export { TIMEZONE, dayKey, todayKarachi };

// NOTE: relative imports with explicit ".js" so scripts/*.js can load these
// models with plain `node` (no "@/" alias there).

export const { Schema } = mongoose;
export const ObjectId = Schema.Types.ObjectId;

import { PAYMENT_METHODS } from "../lib/constants.js";

export { PAYMENT_METHODS };

/** Whole-rupee integer field (PKR). */
export function rupees(extra = {}) {
  return {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "{PATH} must be a whole number of rupees",
    },
    ...extra,
  };
}

/** createdBy / updatedBy (ref User). createdAt/updatedAt come from `timestamps`. */
export function addAuditFields(schema) {
  schema.add({
    createdBy: { type: ObjectId, ref: "User", index: true },
    updatedBy: { type: ObjectId, ref: "User" },
  });
}

/** Soft-delete fields. There is no hard delete anywhere in this app. */
export function addVoidFields(schema) {
  schema.add({
    isVoided: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true },
    voidedBy: { type: ObjectId, ref: "User" },
    voidedAt: { type: Date },
  });
  applyVoidGuards(schema);
}

/**
 * Safety net on every model that has void fields:
 *  - find / findOne / count / distinct / update / aggregate skip voided records by default.
 *    Opt in with `.setOptions({ showVoided: true })` (aggregate: `.option({ showVoided: true })`),
 *    or filter on `isVoided` explicitly.
 *  - Hard deletes throw. Use voidWithAudit() from src/lib/audit.js.
 */
function applyVoidGuards(schema) {
  const hideVoided = function () {
    if (this.getOptions().showVoided) return;
    if (this.getFilter().isVoided === undefined) this.where({ isVoided: { $ne: true } });
  };
  schema.pre(
    ["find", "findOne", "findOneAndUpdate", "countDocuments", "distinct", "updateOne", "updateMany"],
    hideVoided
  );
  schema.pre("aggregate", function () {
    if (this.options?.showVoided) return;
    this.pipeline().unshift({ $match: { isVoided: { $ne: true } } });
  });

  const noHardDelete = function () {
    throw new Error("Hard delete is disabled. Use voidWithAudit() instead.");
  };
  schema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], { query: true, document: false }, noHardDelete);
  schema.pre("deleteOne", { query: false, document: true }, noHardDelete);
}

/** isBackdated = true when `field` is on a day before today (Asia/Karachi). */
export function addBackdatedFlag(schema, field = "date") {
  schema.add({ isBackdated: { type: Boolean, default: false } });
  schema.pre("validate", function () {
    if (this[field] && (this.isNew || this.isModified(field))) {
      this.isBackdated = isBackdated(this[field]);
    }
  });
}

/** Reuse model across hot reloads. */
export function getModel(name, schema) {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) {
    // Dev hot reload: a cached model would keep the OLD schema and silently drop new fields. Re-register it.
    mongoose.deleteModel(name);
  }
  return mongoose.models[name] || mongoose.model(name, schema);
}
