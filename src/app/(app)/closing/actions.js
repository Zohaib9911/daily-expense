"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { closeDay as closeDayRecord, unlockDay as unlockDayRecord } from "@/lib/closing";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { closeDaySchema } from "@/lib/validation/closing";

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
  revalidatePath("/closing", "layout");
  revalidatePath("/payments");
  revalidatePath("/expenses");
}

/** Close (and lock) a day. Figures are recomputed on the server; see src/lib/closing.js. */
export async function closeDay(input) {
  return run(async () => {
    const user = await requireRole(WRITER_ROLES);
    const parsed = closeDaySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const v = parsed.data;
    if (v.date > todayKarachi()) return { ok: false, error: "A future day can't be closed" };
    await closeDayRecord(
      { dateKey: v.date, actualCounted: v.actualCounted, note: v.note, expectedSeen: v.expectedSeen, openingOverride: v.openingOverride },
      user
    );
    refresh();
    return { ok: true };
  });
}

export async function unlockDay(id, reason) {
  return run(async () => {
    const user = await requireRole(["admin"]);
    const parsedId = z.string().regex(/^[a-f\d]{24}$/i).safeParse(id);
    if (!parsedId.success) return { ok: false, error: "Closing not found" };
    await unlockDayRecord(id, reason, user);
    refresh();
    return { ok: true };
  });
}

