import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { authErrorResponse, requireAuth } from "@/lib/auth-helpers";
import { r2Enabled, r2Get } from "@/lib/r2";
import { resolveUploadPath } from "@/lib/uploads";

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// GET /api/files/receipts/2026/11/<id>.jpg: signed-in users only (any role).
export async function GET(_req, { params }) {
  try {
    await requireAuth();
  } catch (e) {
    return authErrorResponse(e);
  }

  const { path: segments } = await params;
  const full = resolveUploadPath(segments);
  const ext = full ? full.slice(full.lastIndexOf(".")).toLowerCase() : "";
  if (!full || !TYPES[ext]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cloudflare R2 first (where new photos go); older photos may still be in the UPLOAD_DIR folder.
  let data = null;
  if (r2Enabled()) {
    try {
      data = (await r2Get(segments.join("/")))?.bytes ?? null;
    } catch (e) {
      console.error("R2 read failed:", e?.name, e?.message);
      return NextResponse.json({ error: "Could not load the photo. Please try again." }, { status: 502 });
    }
  }
  if (!data) {
    try {
      data = await fs.readFile(full);
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  return new Response(data, {
    headers: {
      "Content-Type": TYPES[ext],
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=86400", // never cached by shared proxies/CDNs
      "X-Content-Type-Options": "nosniff",
    },
  });
}
