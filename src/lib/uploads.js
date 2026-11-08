import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/dates";
import { r2Enabled, r2Exists, r2Put } from "@/lib/r2";

// Server-only. Files live in UPLOAD_DIR (outside /public) and are only ever served by
// /api/files/[...path] to signed-in users.

// Input size, before compression. 10 MB is also Next's default request-body limit when a
// proxy.js exists, and the browser shrinks photos to well under 1 MB before uploading anyway.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function uploadRoot() {
  // UPLOAD_DIR is deliberately outside the project, so tell Turbopack not to trace it.
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads");
}

/**
 * Compress and store a receipt photo: max 1200px wide JPEG (+ a 240px thumbnail) in
 * UPLOAD_DIR/receipts/YYYY/MM/. EXIF is applied (so phone photos aren't sideways) and then
 * stripped (no GPS data kept). Throws if the buffer isn't a decodable image.
 */
export async function saveReceiptImage(buffer) {
  const ym = formatInTimeZone(new Date(), TIMEZONE, "yyyy/MM");
  const id = crypto.randomBytes(16).toString("hex");

  const base = () => sharp(buffer, { failOn: "error" }).rotate().flatten({ background: "#ffffff" });
  const full = base().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78 });
  const thumb = base().resize({ width: 240, withoutEnlargement: true }).jpeg({ quality: 70 });

  if (r2Enabled()) {
    // Cloudflare R2: both sizes go to the bucket (inside the app's folder); nothing is kept on this server's disk.
    const [fullBytes, thumbBytes] = await Promise.all([full.toBuffer(), thumb.toBuffer()]);
    await Promise.all([r2Put(`receipts/${ym}/${id}.jpg`, fullBytes), r2Put(`receipts/${ym}/${id}-t.jpg`, thumbBytes)]);
  } else {
    const dir = path.join(uploadRoot(), "receipts", ym);
    await fs.mkdir(dir, { recursive: true });
    await full.toFile(path.join(dir, `${id}.jpg`));
    await thumb.toFile(path.join(dir, `${id}-t.jpg`));
  }

  const url = `/api/files/receipts/${ym}/${id}.jpg`;
  return { url, thumbUrl: `/api/files/receipts/${ym}/${id}-t.jpg` };
}

/** URL segments -> absolute file path inside UPLOAD_DIR, or null if anything looks unsafe. */
export function resolveUploadPath(segments) {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 6) return null;
  if (!segments.every((s) => SEGMENT_RE.test(s))) return null; // no "..", no leading dot, no slashes
  const root = uploadRoot();
  const full = path.resolve(root, ...segments);
  return full.startsWith(root + path.sep) ? full : null;
}

/** Does the file behind a "/api/files/..." URL exist (in R2 when it is switched on, or in UPLOAD_DIR)? */
export async function uploadExists(url) {
  const segments = String(url).replace(/^\/api\/files\//, "").split("/");
  const full = resolveUploadPath(segments);
  if (!full) return false;
  if (r2Enabled() && (await r2Exists(segments.join("/")))) return true;
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}
