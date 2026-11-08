"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Attendance from "@/models/Attendance";
import Staff from "@/models/Staff";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { createWithAudit, updateWithAudit } from "@/lib/audit";
import { dayKey, dayRange, noonOfKey, todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { fieldErrors } from "@/lib/validation/expense";
import { attendanceSchema, staffSchema } from "@/lib/validation/staff";

async function run(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err?.name === "ValidationError") {
      return { ok: false, error: Object.values(err.errors)[0]?.message || "Invalid data" };
    }
    throw err;
  }
}

function parseStaff(input) {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { fail: { ok: false, error: Object.values(errors)[0], fieldErrors: errors } };
  }
  const v = parsed.data;
  return {
    data: {
      name: v.name,
      phone: v.phone || undefined,
      cnic: v.cnic || undefined,
      role: v.role || undefined,
      wageType: v.wageType,
      wageAmount: v.wageAmount,
      joinDate: v.joinDate ? noonOfKey(v.joinDate) : undefined,
      active: v.active,
    },
  };
}

export async function createStaff(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const { data, fail } = parseStaff({ ...input, active: true });
    if (fail) return fail;
    const doc = await createWithAudit(Staff, data, user);
    revalidatePath("/staff");
    return { ok: true, id: doc.id };
  });
}

export async function updateStaff(id, input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    if (!mongoose.isValidObjectId(id)) throw new AppError("Staff member not found", 404);
    const { data, fail } = parseStaff(input);
    if (fail) return fail;
    // Optional fields cleared in the form must actually be cleared (undefined would keep the old value).
    const updates = { ...data };
    for (const k of ["phone", "cnic", "role", "joinDate"]) if (updates[k] === undefined) updates[k] = null;
    await updateWithAudit(Staff, id, updates, user);
    revalidatePath("/staff");
    revalidatePath(`/staff/${id}`);
    return { ok: true, id };
  });
}

/**
 * Mark one staff member present / half day / absent for a day. Marking again changes the status
 * (the change is audit-logged). Every day has at most one live record per person.
 */
export async function markAttendance(staffId, date, status) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const parsed = attendanceSchema.safeParse({ staffId, date, status });
    if (!parsed.success) throw new AppError(Object.values(fieldErrors(parsed.error))[0], 400);

    const staff = await Staff.findById(staffId).lean();
    if (!staff) throw new AppError("Staff member not found", 404);
    if (!staff.active) throw new AppError("This staff member is not active", 409);
    if (staff.joinDate && date < dayKey(staff.joinDate)) throw new AppError(`${staff.name} had not joined on that date`, 409);

    const { start, end } = dayRange(date);
    const existing = await Attendance.findOne({ staff: staffId, date: { $gte: start, $lt: end } });
    if (existing) {
      if (existing.status !== status) await updateWithAudit(Attendance, existing.id, { status }, user);
    } else {
      // Always stored at noon so the "one record per staff per day" unique index works.
      await createWithAudit(Attendance, { staff: staffId, date: noonOfKey(date), status }, user);
    }
    revalidatePath("/staff/attendance");
    revalidatePath("/staff", "layout");
    return { ok: true };
  });
}

/** Mark everyone who has no record yet for that day as present. */
export async function markAllPresent(date) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await connectDB();
    const parsed = attendanceSchema.pick({ date: true }).safeParse({ date });
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message, 400);

    const { start, end } = dayRange(date);
    const [staff, marked] = await Promise.all([
      Staff.find({ active: true }).lean(),
      Attendance.find({ date: { $gte: start, $lt: end } }).select("staff").lean(),
    ]);
    const done = new Set(marked.map((a) => String(a.staff)));
    let count = 0;
    for (const s of staff) {
      if (done.has(String(s._id))) continue;
      if (s.joinDate && date < dayKey(s.joinDate)) continue;
      await createWithAudit(Attendance, { staff: s._id, date: noonOfKey(date), status: "present" }, user);
      count++;
    }
    revalidatePath("/staff/attendance");
    revalidatePath("/staff", "layout");
    return { ok: true, count, today: todayKarachi() };
  });
}
