"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { AuthError, requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

const ROLES = ["admin", "manager", "viewer"];

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "Username: 3-30 letters, numbers, dot, dash or underscore");
// bcrypt only uses the first 72 bytes, so cap the length.
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");
const roleSchema = z.enum(ROLES, { message: "Choose a valid role" });
const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid user");

const fail = (error, values) => ({ ok: false, error, values });
const done = (message) => ({ ok: true, message, at: Date.now() });
const firstIssue = (parsed) => parsed.error.issues[0].message;

// Runs the admin check; returns { actor } or { error } so every action handles it the same way.
async function adminOnly() {
  try {
    return { actor: await requireRole(["admin"]) };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? "Session expired. Please sign in again." : err.message };
    }
    throw err;
  }
}

const snapshot = (u) => ({
  name: u.name,
  username: u.username,
  role: u.role,
  phone: u.phone ?? null,
  active: u.active,
});

export async function createUser(_prev, formData) {
  const values = {
    name: String(formData.get("name") ?? ""),
    username: String(formData.get("username") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    role: String(formData.get("role") ?? "viewer"),
  };
  const { actor, error } = await adminOnly();
  if (error) return fail(error, values);

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter the person's name").max(80),
      username: usernameSchema,
      phone: z.string().trim().max(20),
      role: roleSchema,
      password: passwordSchema,
    })
    .safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return fail(firstIssue(parsed), values);

  const { name, username, phone, role, password } = parsed.data;
  await connectDB();
  if (await User.exists({ username })) return fail(`Username "${username}" is already taken`, values);

  try {
    const user = await User.create({
      name,
      username,
      phone: phone || undefined,
      role,
      active: true,
      passwordHash: await bcrypt.hash(password, 12),
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    await logAudit({
      collectionName: "users",
      recordId: user._id,
      action: "create",
      newValue: snapshot(user),
      user: actor,
    });
  } catch (err) {
    if (err?.code === 11000) return fail(`Username "${username}" is already taken`, values);
    throw err;
  }

  revalidatePath("/settings/users");
  return done(`User "${username}" created`);
}

export async function changeRole(_prev, formData) {
  const { actor, error } = await adminOnly();
  if (error) return fail(error);

  const parsed = z
    .object({ userId: idSchema, role: roleSchema })
    .safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return fail(firstIssue(parsed));
  const { userId, role } = parsed.data;

  if (userId === actor.id) return fail("You can't change your own role");

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return fail("User not found");
  if (user.role === role) return done("Role unchanged");

  const oldValue = snapshot(user);
  user.role = role;
  user.updatedBy = actor.id;
  await user.save();
  await logAudit({
    collectionName: "users",
    recordId: user._id,
    action: "update",
    oldValue,
    newValue: snapshot(user),
    user: actor,
  });

  revalidatePath("/settings/users");
  return done(`${user.username} is now ${role}`);
}

export async function resetPassword(_prev, formData) {
  const { actor, error } = await adminOnly();
  if (error) return fail(error);

  const parsed = z
    .object({ userId: idSchema, password: passwordSchema })
    .safeParse({ userId: formData.get("userId"), password: String(formData.get("password") ?? "") });
  if (!parsed.success) return fail(firstIssue(parsed));
  const { userId, password } = parsed.data;

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return fail("User not found");

  user.passwordHash = await bcrypt.hash(password, 12);
  user.updatedBy = actor.id;
  await user.save();
  // Never log the password or hash.
  await logAudit({
    collectionName: "users",
    recordId: user._id,
    action: "update",
    oldValue: { passwordReset: false },
    newValue: { passwordReset: true },
    user: actor,
  });

  revalidatePath("/settings/users");
  return done(`Password reset for ${user.username}`);
}

export async function setActive(_prev, formData) {
  const { actor, error } = await adminOnly();
  if (error) return fail(error);

  const parsed = z
    .object({ userId: idSchema, active: z.enum(["true", "false"]) })
    .safeParse({ userId: formData.get("userId"), active: formData.get("active") });
  if (!parsed.success) return fail(firstIssue(parsed));
  const { userId } = parsed.data;
  const active = parsed.data.active === "true";

  if (userId === actor.id && !active) return fail("You can't deactivate your own account");

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return fail("User not found");
  if (user.active === active) return done("No change");

  const oldValue = snapshot(user);
  user.active = active;
  user.updatedBy = actor.id;
  await user.save();
  await logAudit({
    collectionName: "users",
    recordId: user._id,
    action: "update",
    oldValue,
    newValue: snapshot(user),
    user: actor,
  });

  revalidatePath("/settings/users");
  return done(`${user.username} ${active ? "reactivated" : "deactivated"}`);
}
