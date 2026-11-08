import Link from "next/link";
import { ChevronRight, DatabaseBackup, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "Settings" };

function LinkCard({ href, icon: Icon, title, text }) {
  return (
    <Link href={href} className="block">
      <Card className="flex min-h-16 items-center gap-3 hover:bg-slate-50">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-900">
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{title}</span>
          <span className="block text-sm text-slate-500">{text}</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-slate-400" />
      </Card>
    </Link>
  );
}

export default async function SettingsPage() {
  await requirePageRole(["admin"]);
  await connectDB();
  const s = await Settings.getSingleton();
  const initial = {
    shopName: s.shopName,
    receiptRequiredAbove: s.receiptRequiredAbove,
    approvalRequiredAbove: s.approvalRequiredAbove,
    openingCashBalance: s.openingCashBalance ?? 0,
  };

  return (
    <div className="space-y-4">
      <SettingsForm initial={initial} />
      <div className="space-y-3">
        <LinkCard href="/settings/users" icon={Users} title="Users" text="Add people, change roles, reset passwords" />
        <LinkCard href="/settings/backup" icon={DatabaseBackup} title="Backup" text="Download a full copy of all your data" />
      </div>
    </div>
  );
}
