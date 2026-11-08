"use server";

import { revalidatePath } from "next/cache";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { giveAdvance as giveAdvanceRecord, voidAdvance as voidAdvanceRecord } from "@/lib/staff-money";
import { WRITER_ROLES } from "@/lib/nav";
import { fieldErrors } from "@/lib/validation/expense";
import { advanceSchema } from "@/lib/validation/staff";

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

function refresh() {
  revalidatePath("/advances");
  revalidatePath("/expenses");
  revalidatePath("/staff", "layout");
}

/** Give a staff advance. Also creates the linked staff_advance Expense (see src/lib/staff-money.js). */
export async function giveAdvance(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    const parsed = advanceSchema.safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;
    const advance = await giveAdvanceRecord({ staffId: v.staffId, amount: v.amount, method: v.method, dateKey: v.date, note: v.note }, user);
    refresh();
    return { ok: true, id: advance.id, staffId: v.staffId };
  });
}

export async function voidAdvance(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await voidAdvanceRecord(id, reason, user);
    refresh();
    return { ok: true };
  });
}
