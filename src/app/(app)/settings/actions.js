"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import { AppError, requireRole } from "@/lib/auth-helpers";
import { updateWithAudit } from "@/lib/audit";
import { settingsSchema } from "@/lib/validation/settings";

/**
 * Owner only. Saves shop name, limits and opening cash. The change (old and new values) goes to the audit log.
 * Returns { ok, message } or { ok: false, error, fieldErrors }.
 */
export async function updateSettings(input) {
  try {
    const user = await requireRole(["admin"]);
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const i of parsed.error.issues) fieldErrors[i.path[0]] ??= i.message;
      return { ok: false, error: parsed.error.issues[0].message, fieldErrors };
    }
    await connectDB();
    const settings = await Settings.getSingleton();
    const updated = await updateWithAudit(Settings, settings.id, parsed.data, user);
    revalidatePath("/", "layout"); // shop name in the sidebar, limits used by the forms, opening cash in closing
    // updateWithAudit returns the document; an unchanged save is a no-op (nothing logged).
    const changed = Object.keys(parsed.data).some((k) => settings[k] !== parsed.data[k]);
    return { ok: true, message: changed ? "Settings saved" : "Nothing changed", at: Date.now(), id: String(updated?._id ?? settings._id) };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
