"use server";

import { revalidatePath } from "next/cache";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { paySalary as paySalaryRecord, voidSalary as voidSalaryRecord } from "@/lib/staff-money";
import { WRITER_ROLES } from "@/lib/nav";
import { fieldErrors } from "@/lib/validation/expense";
import { salaryInputSchema } from "@/lib/validation/staff";

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
  revalidatePath("/staff", "layout");
  revalidatePath("/expenses");
  revalidatePath("/advances");
}

/**
 * Pay a month's salary. The gross is calculated on the server from attendance (the browser only
 * shows a preview). Creates the SalaryPayment, updates the advances it deducts from, and creates
 * the linked salary Expense for the net amount (see src/lib/staff-money.js).
 */
export async function paySalary(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    const parsed = salaryInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      return { ok: false, error: Object.values(errors)[0], fieldErrors: errors };
    }
    const v = parsed.data;
    const payment = await paySalaryRecord({ ...v, dateKey: v.date }, user);
    refresh();
    return { ok: true, id: payment.id, staffId: v.staffId };
  });
}

export async function voidSalary(id, reason) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    await voidSalaryRecord(id, reason, user);
    refresh();
    return { ok: true };
  });
}
