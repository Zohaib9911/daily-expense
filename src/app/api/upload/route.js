import { NextResponse } from "next/server";
import sharp from "sharp";
import { authErrorResponse, requireRole } from "@/lib/auth-helpers";
import { WRITER_ROLES } from "@/lib/nav";
import { MAX_UPLOAD_BYTES, saveReceiptImage } from "@/lib/uploads";

const err = (message, status) => NextResponse.json({ error: message }, { status });

// POST multipart/form-data with a "file" field (a photo). Admin/manager only.
// Returns { url, thumbUrl }: store `url` as the record's receiptUrl.
export async function POST(req) {
  try {
    await requireRole(WRITER_ROLES);
  } catch (e) {
    return authErrorResponse(e);
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return err("Could not read the upload", 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return err("No photo was sent", 400);
  if (file.size === 0) return err("The photo is empty", 400);
  if (file.size > MAX_UPLOAD_BYTES) return err("The photo is too large (max 10 MB)", 413);
  if (file.type && !file.type.startsWith("image/")) return err("Only photos can be uploaded", 415);

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await sharp(buffer).metadata(); // really an image? (checks content, not the file name or type)
  } catch {
    return err("That file isn't a valid image", 400);
  }

  try {
    return NextResponse.json(await saveReceiptImage(buffer));
  } catch (e) {
    console.error("Receipt upload failed:", e);
    return err("Could not save the photo. Please try again.", 500);
  }
}
