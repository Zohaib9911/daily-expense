import { cache } from "react";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db";
import User from "@/models/User";

/**
 * Server-side auth helpers. Role and active status are re-read from the database
 * on every request, so changing a role or deactivating a user takes effect at once
 * (the JWT cookie alone is never trusted for authorization).
 *
 * Server actions / API routes:   const user = await requireRole(["admin", "manager"]);
 *   - throws AuthError (401 not signed in, 403 wrong role)
 *   - API routes: catch and `return authErrorResponse(err)`
 * Pages / layouts:               const user = await requirePageRole(["admin"]);
 *   - redirects instead of throwing
 */

/** An expected, user-facing failure (bad input 400, not found 404, locked day 423...). */
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

/** 401 not signed in / 403 not allowed. */
export class AuthError extends AppError {
  constructor(message, status) {
    super(message, status);
    this.name = "AuthError";
  }
}

/** Current user (fresh from DB) or null. De-duplicated per request. */
export const getCurrentUser = cache(async () => {
  // Opt into request-time rendering BEFORE next-auth runs: it generates a random
  // CSRF token, which Cache Components refuses to do during prerendering.
  await connection();
  await cookies();
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id || !mongoose.isValidObjectId(id)) return null;

  await connectDB();
  const u = await User.findById(id).select("name username role active").lean();
  if (!u || !u.active) return null;
  return { id: String(u._id), name: u.name, username: u.username, role: u.role };
});

/** Any signed-in, active user. */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not signed in", 401);
  return user;
}

/** Signed-in user whose role is in `roles`, e.g. requireRole(["admin"]). */
export async function requireRole(roles) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new AuthError("You do not have permission to do this", 403);
  }
  return user;
}

/** For pages and layouts: redirect to /login if signed out. */
export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect to /login if signed out, to / if the role isn't allowed. */
export async function requirePageRole(roles) {
  const user = await requirePageUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/**
 * In an API route's catch block: turns AuthError / AppError (and mongoose validation
 * errors) into a JSON response with the right status, rethrows anything else.
 */
export function authErrorResponse(err) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err?.name === "ValidationError") {
    const first = Object.values(err.errors ?? {})[0];
    return NextResponse.json({ error: first?.message || "Invalid data" }, { status: 400 });
  }
  throw err;
}
