"use server";

import { revalidatePath } from "next/cache";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { approveExpense as approve, rejectExpense as reject } from "@/lib/approvals";

async function run(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

function refresh() {
  revalidatePath("/", "layout"); // the red badge, dashboard figures, everything that totals expenses
}

/** Owner only. */
export async function approveExpense(id) {
  return run(async () => {
    const user = await requireRole(["admin"]);
    await approve(id, user);
    refresh();
    return { ok: true };
  });
}

/** Owner only. A reason (min 5 characters) is required. */
export async function rejectExpense(id, reason) {
  return run(async () => {
    const user = await requireRole(["admin"]);
    await reject(id, reason, user);
    refresh();
    return { ok: true };
  });
}
