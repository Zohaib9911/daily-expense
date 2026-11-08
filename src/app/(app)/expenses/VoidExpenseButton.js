"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import VoidDialog from "@/components/ui/VoidDialog";
import { voidExpense } from "./actions";

export default function VoidExpenseButton({ id, summary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function submit(reason) {
    const res = await voidExpense(id, reason);
    if (res?.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    return { error: res?.error || "Could not void this expense" };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        <Ban size={18} />
        Void expense
      </button>
      <VoidDialog
        open={open}
        title="Void this expense?"
        description={`${summary}. It stays in the system, marked as voided, and can't be edited afterwards.`}
        successMessage="Expense voided"
        onSubmit={submit}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
