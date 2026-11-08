// Usage:  node scripts/migrate-uploads-to-r2.js
//
// Copies every photo already saved in UPLOAD_DIR (the old local folder) into the Cloudflare R2 bucket, so records made before
// R2 was switched on keep working. Safe to run again: files that are already in the bucket are skipped. It never deletes
// anything: once you have checked the photos open fine, you can remove the old local folder yourself.
// Reads UPLOAD_DIR and the R2_* values from .env.local / .env.
import fs from "node:fs/promises";
import path from "node:path";
import { r2Enabled, r2Exists, r2Prefix, r2Put } from "../src/lib/r2.js";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file missing: fine */
  }
}

if (!r2Enabled()) {
  console.error("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in .env.local.");
  process.exit(1);
}

const root = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const base = path.join(root, "receipts");

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && /\.jpg$/i.test(e.name)) yield full;
  }
}

console.log(`From ${base} to the R2 bucket, folder "${r2Prefix()}"`);
let copied = 0;
let skipped = 0;
let failed = 0;
for await (const file of walk(base)) {
  const key = path.relative(root, file).split(path.sep).join("/"); // receipts/2026/11/<id>.jpg
  try {
    if (await r2Exists(key)) {
      skipped += 1;
      continue;
    }
    await r2Put(key, await fs.readFile(file), "image/jpeg");
    copied += 1;
    console.log(`  copied ${key}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAILED ${key}: ${err.message}`);
  }
}
console.log(`Done: ${copied} copied, ${skipped} already there, ${failed} failed.`);
if (failed) process.exitCode = 1;
