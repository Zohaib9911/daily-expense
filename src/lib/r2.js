import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Server-only. Cloudflare R2 (S3-compatible) storage for uploaded photos.
// Enabled only when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME are all set; otherwise the app
// keeps using the UPLOAD_DIR folder. The bucket stays PRIVATE as far as this app is concerned: photos are only ever shown to
// signed-in users through /api/files/..., which reads them from here (R2_PUBLIC_URL is never used or exposed).
//
// Keys: <R2_PREFIX><path>, e.g. "shop-portal/receipts/2026/11/<id>.jpg" (R2_PREFIX defaults to "shop-portal/", so this app's
// files never mix with anything else in the bucket).

const env = (k) => (process.env[k] || "").trim();

export function r2Enabled() {
  return Boolean(env("R2_ACCOUNT_ID") && env("R2_ACCESS_KEY_ID") && env("R2_SECRET_ACCESS_KEY") && env("R2_BUCKET_NAME"));
}

export function r2Prefix() {
  const p = process.env.R2_PREFIX === undefined ? "shop-portal/" : env("R2_PREFIX");
  return p && !p.endsWith("/") ? `${p}/` : p;
}

let client;
function s3() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });
  return client;
}

const keyOf = (path) => `${r2Prefix()}${String(path).replace(/^\/+/, "")}`;
const notFound = (e) => e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;

/** Store a file. `path` is relative to the app's folder, e.g. "receipts/2026/11/<id>.jpg". */
export async function r2Put(path, body, contentType = "image/jpeg") {
  await s3().send(
    new PutObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: keyOf(path), Body: body, ContentType: contentType, CacheControl: "private, max-age=86400" })
  );
}

/** Does the file exist in the bucket? */
export async function r2Exists(path) {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: keyOf(path) }));
    return true;
  } catch (e) {
    if (notFound(e)) return false;
    throw e;
  }
}

/** Read a file: { bytes: Buffer, contentType } or null when it isn't there. */
export async function r2Get(path) {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: keyOf(path) }));
    return { bytes: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType || "" };
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

/** Remove a file (only used by the connection test and the migration script's cleanup). */
export async function r2Delete(path) {
  await s3().send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: keyOf(path) }));
}
