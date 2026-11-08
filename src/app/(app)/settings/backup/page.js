import { Download, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import { formatDateTime } from "@/lib/dates";
import AuditLog from "@/models/AuditLog";
import { r2Enabled, r2Prefix } from "@/lib/r2";
import { btnPrimary } from "@/lib/ui";

export const metadata = { title: "Backup" };

export default async function BackupPage() {
  await requirePageRole(["admin"]);
  await connectDB();
  const last = await AuditLog.findOne({ collectionName: "backup", action: "export" }).sort({ timestamp: -1 }).lean();
  const cols = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith("system.")).length;

  return (
    <div className="space-y-4">
      <Card title="Download a full backup" className="space-y-3">
        <p className="text-sm text-slate-600">
          One JSON file with all {cols} collections: orders, payments, expenses, staff, suppliers, closings, settings and the audit log. Voided and rejected records are included.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>User password hashes are never included.</li>
          <li>
            {r2Enabled()
              ? `Photos (receipts, furniture pictures) are not inside this file: they are stored in your Cloudflare R2 bucket, in the folder "${r2Prefix()}".`
              : "Uploaded receipt photos are separate files in the uploads folder on the server; back that folder up too."}
          </li>
          <li>Each download is recorded in the Audit Log.</li>
        </ul>
        {/* A plain link: the browser streams the file straight to disk. */}
        <a href="/api/backup" download className={`${btnPrimary} min-h-12 w-full`}>
          <Download size={18} />
          Download backup (JSON)
        </a>
        <p className="text-xs text-slate-500">{last ? `Last backup: ${formatDateTime(last.timestamp)} by ${last.userName}.` : "No backup has been downloaded yet."}</p>
      </Card>

      <Card className="flex gap-3">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-green-600" />
        <p className="text-sm text-slate-600">
          The file contains your business data. Keep it somewhere private. Only the owner can download it.
        </p>
      </Card>
    </div>
  );
}
