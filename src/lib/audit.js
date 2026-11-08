import mongoose from "mongoose";
import { headers } from "next/headers";
import connectDB from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import DailyClosing from "@/models/DailyClosing";
import { AppError, AuthError } from "@/lib/auth-helpers";
import { dayKey, dayRange } from "@/lib/dates";

/**
 * Audit + safety layer. ALL writes to transaction records should go through
 * createWithAudit / updateWithAudit / voidWithAudit. Each one:
 *   1. checks the user may write (admin or manager; viewers can't),
 *   2. enforces the daily-closing lock (managers can't touch a locked day; admin can),
 *   3. saves with createdBy/updatedBy set, so computed fields and isBackdated run,
 *   4. writes an AuditLog entry with old and new values.
 *
 * `user` is what requireRole() returns: { id, name, role }.
 * Errors thrown are AppError/AuthError (have .status); mongoose ValidationError may also bubble.
 *
 * Limitation: MongoDB standalone has no transactions, so the record and its audit entry are
 * two writes. If the audit write fails the error is thrown loudly (the record is saved).
 */

const WRITE_ROLES = ["admin", "manager"];
const ACTIONS = ["create", "update", "void", "approve", "reject", "export"];

// Which field holds the "business date" of each model. Models not listed here
// (User, Supplier, Staff, Settings) have no date and are never day-locked.
const DATE_FIELDS = {
  Order: "orderDate",
  Payment: "date",
  Expense: "date",
  MaterialPurchase: "date",
  SupplierPayment: "date",
  StaffAdvance: "date",
  SalaryPayment: "date",
  Attendance: "date",
  DailyClosing: "date",
};

// Never accepted from callers: set by the system or only changed through dedicated helpers.
const PROTECTED_FIELDS = [
  "_id", "__v", "createdBy", "createdAt", "updatedBy", "updatedAt",
  "isVoided", "voidReason", "voidedBy", "voidedAt", "isBackdated", "passwordHash",
];

/* ------------------------------------------------------------------ logging */

/** Plain JSON copy of a doc/object for the audit trail (ObjectIds -> strings, dates -> ISO). Never includes password hashes. */
function snapshot(value) {
  if (value === undefined || value === null) return value;
  const plain = JSON.parse(JSON.stringify(value));
  if (plain && typeof plain === "object") {
    delete plain.__v;
    delete plain.passwordHash;
  }
  return plain;
}

async function clientIp(req) {
  try {
    const h = req?.headers ?? (await headers());
    const get = (k) => (typeof h.get === "function" ? h.get(k) : h[k]);
    const xff = get("x-forwarded-for");
    // Behind Nginx the last entry is the one Nginx added (not spoofable).
    if (xff) return String(xff).split(",").pop().trim();
    return get("x-real-ip") || "unknown";
  } catch {
    return "unknown"; // outside a request
  }
}

/**
 * Append one AuditLog entry. `req` (a Request) is optional: used for the IP;
 * without it the IP is read from the current request's headers.
 * Never put secrets in oldValue/newValue.
 */
export async function logAudit({ collectionName, recordId, action, oldValue, newValue, user, req }) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown audit action "${action}"`);
  if (!user?.id) throw new AuthError("Not signed in", 401);
  await connectDB();
  return AuditLog.create({
    collectionName,
    recordId,
    action,
    oldValue: snapshot(oldValue),
    newValue: snapshot(newValue),
    user: user.id,
    userName: user.name,
    ip: await clientIp(req),
  });
}

/* ------------------------------------------------------------------- guards */

function assertCanWrite(user) {
  if (!user?.id) throw new AuthError("Not signed in", 401);
  if (!WRITE_ROLES.includes(user.role)) {
    throw new AuthError("You do not have permission to change records", 403);
  }
}

/**
 * Daily-closing lock. If a DailyClosing for `date`'s Karachi day is locked, only an admin
 * may continue; managers get a 423. (Unlocking = updating the closing, which is itself
 * blocked for managers by this same check.)
 */
export async function assertDayUnlocked(user, date, verb = "change") {
  if (user?.role === "admin" || !date) return;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return; // validation will reject a bad date
  const { start, end } = dayRange(d);
  const locked = await DailyClosing.exists({ date: { $gte: start, $lt: end }, isLocked: true });
  if (locked) {
    throw new AppError(
      `${dayKey(d)} is locked by the daily cash closing. Only an admin can ${verb} entries on a locked day.`,
      423
    );
  }
}

/** True if the Karachi day of `date` has a locked closing. */
export async function isDayLocked(date) {
  await connectDB();
  const { start, end } = dayRange(date);
  return !!(await DailyClosing.exists({ date: { $gte: start, $lt: end }, isLocked: true }));
}

function stripProtected(data) {
  const out = { ...data };
  for (const k of PROTECTED_FIELDS) delete out[k];
  return out;
}

async function loadRecord(Model, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid record id", 400);
  // showVoided: so we can say "already voided" instead of "not found".
  const doc = await Model.findById(id).setOptions({ showVoided: true });
  if (!doc) throw new AppError(`${Model.modelName} not found`, 404);
  return doc;
}

/* ------------------------------------------------------------------ writers */

export async function createWithAudit(Model, data, user, { req } = {}) {
  assertCanWrite(user);
  await connectDB();

  const doc = new Model({ ...stripProtected(data), createdBy: user.id, updatedBy: user.id });
  const field = DATE_FIELDS[Model.modelName];
  if (field) await assertDayUnlocked(user, doc[field], "create");

  await doc.save();
  await logAudit({
    collectionName: Model.collection.name,
    recordId: doc._id,
    action: "create",
    newValue: doc,
    user,
    req,
  });
  return doc;
}

export async function updateWithAudit(Model, id, updates, user, { req } = {}) {
  assertCanWrite(user);
  await connectDB();

  const doc = await loadRecord(Model, id);
  if (doc.isVoided) throw new AppError("This record is voided and can't be edited", 409);

  const clean = stripProtected(updates);
  if (Model.modelName === "Order") delete clean.orderNo; // order numbers never change

  const field = DATE_FIELDS[Model.modelName];
  if (field) {
    await assertDayUnlocked(user, doc[field], "edit"); // where it is now
    if (clean[field] !== undefined) await assertDayUnlocked(user, clean[field], "move"); // where it's going
  }

  const oldValue = snapshot(doc);
  doc.set(clean);
  if (!doc.modifiedPaths().length) return doc; // nothing changed: no write, no audit noise
  doc.updatedBy = user.id;
  await doc.save();

  await logAudit({
    collectionName: Model.collection.name,
    recordId: doc._id,
    action: "update",
    oldValue,
    newValue: doc,
    user,
    req,
  });
  return doc;
}

export async function voidWithAudit(Model, id, reason, user, { req } = {}) {
  assertCanWrite(user);
  const why = String(reason ?? "").trim();
  if (why.length < 5) throw new AppError("A reason of at least 5 characters is required to void a record", 400);
  if (!Model.schema.path("isVoided")) throw new AppError(`${Model.modelName} records can't be voided`, 400);
  await connectDB();

  const doc = await loadRecord(Model, id);
  if (doc.isVoided) throw new AppError("This record is already voided", 409);

  const field = DATE_FIELDS[Model.modelName];
  if (field) await assertDayUnlocked(user, doc[field], "void");

  const oldValue = snapshot(doc);
  doc.isVoided = true;
  doc.voidReason = why;
  doc.voidedBy = user.id;
  doc.voidedAt = new Date();
  doc.updatedBy = user.id;
  await doc.save();

  await logAudit({
    collectionName: Model.collection.name,
    recordId: doc._id,
    action: "void",
    oldValue,
    newValue: doc,
    user,
    req,
  });
  return doc;
}

/* ------------------------------------------------------------------ readers */

/**
 * Query that skips voided records unless { showVoided: true }.
 * (The model-level guard already does this for plain Model.find(); this helper makes
 * the intent explicit and returns a normal Query you can chain .sort()/.lean() on.)
 */
export function findRecords(Model, filter = {}, { showVoided = false } = {}) {
  const q = Model.find(filter);
  return showVoided ? q.setOptions({ showVoided: true }) : q;
}

export function findRecordById(Model, id, { showVoided = false } = {}) {
  const q = Model.findById(id);
  return showVoided ? q.setOptions({ showVoided: true }) : q;
}
