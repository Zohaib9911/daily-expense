"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import VoidDialog from "@/components/ui/VoidDialog";

/**
 * Small "Void" button + reason dialog for any record. `action` is a server action
 * `(id, reason) => { ok } | { ok: false, error }`; the page refreshes on success.
 */
export default function VoidRecordButton({ action, id, title, description, label = "Void", className = "", successMessage = "Record voided" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function submit(reason) {
    const res = await action(id, reason);
    if (res?.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    return { error: res?.error || "Could not void this record" };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-300 px-3 text-sm font-semibold text-red-600 hover:bg-red-50 ${className}`}
      >
        <Ban size={16} />
        {label}
      </button>
      <VoidDialog open={open} title={title} successMessage={successMessage} description={description} onSubmit={submit} onCancel={() => setOpen(false)} />
    </>
  );
}
