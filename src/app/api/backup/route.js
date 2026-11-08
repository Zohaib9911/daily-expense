import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { authErrorResponse, requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { todayKarachi } from "@/lib/dates";

// Owner-only full JSON export of every collection (voided records included).
// Streamed one document at a time so a large shop doesn't need the whole database in memory.
// Password hashes are never exported. Extended JSON keeps ObjectIds and dates restorable.

const EJSON = mongoose.mongo.BSON.EJSON;

export async function GET(req) {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (err) {
    return authErrorResponse(err);
  }

  await connectDB();
  const db = mongoose.connection.db;
  const infos = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith("system."));
  infos.sort((a, b) => a.name.localeCompare(b.name));

  // Counts first, so the audit entry (and the file header) say what was exported.
  const counts = {};
  for (const { name } of infos) counts[name] = await db.collection(name).countDocuments({});
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  await logAudit({
    collectionName: "backup",
    recordId: new mongoose.Types.ObjectId(),
    action: "export",
    oldValue: null,
    newValue: { what: "full JSON backup", collections: counts, documents: total },
    user,
    req,
  });

  // The entry above is part of the export too, so the header count matches what the file contains.
  if (counts.auditlogs !== undefined) counts.auditlogs = await db.collection("auditlogs").countDocuments({});

  const encoder = new TextEncoder();
  const stripSecrets = (doc, name) => {
    if (name === "users") delete doc.passwordHash;
    return doc;
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s) => controller.enqueue(encoder.encode(s));
      try {
        send(`{\n"exportedAt": ${JSON.stringify(new Date().toISOString())},\n"exportedBy": ${JSON.stringify(user.name)},\n"counts": ${JSON.stringify(counts)},\n"note": "Extended JSON (ObjectId as {$oid}, dates as {$date}). Voided records are included. User password hashes are not exported.",\n"collections": {`);
        let firstCol = true;
        for (const { name } of infos) {
          send(`${firstCol ? "" : ","}\n${JSON.stringify(name)}: [`);
          firstCol = false;
          const cursor = db.collection(name).find({});
          let first = true;
          for await (const doc of cursor) {
            send(`${first ? "" : ","}\n${EJSON.stringify(stripSecrets(doc, name), { relaxed: true })}`);
            first = false;
          }
          send("\n]");
        }
        send("\n}\n}\n");
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="shop-backup-${todayKarachi()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
