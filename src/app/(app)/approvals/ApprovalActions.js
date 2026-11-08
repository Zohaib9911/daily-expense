"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import VoidDialog from "@/components/ui/VoidDialog";
import { approveExpense, rejectExpense } from "./actions";
import { btn } from "@/lib/ui";

/** Approve (confirm first) and Reject (reason required). `canReject` is false for auto-created expenses. */
export default function ApprovalActions({ id, summary, canReject }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null); // "approve" | "reject" | null

  async function approve() {
    const res = await approveExpense(id);
    if (res?.ok) {
      setDialog(null);
      router.refresh();
      return;
    }
    if (/already/.test(res?.error || "")) router.refresh();
    return { error: res?.error || "Could not approve" };
  }

  async function reject(reason) {
    const res = await rejectExpense(id, reason);
    if (res?.ok) {
      setDialog(null);
      router.refresh();
      return;
    }
    if (/already/.test(res?.error || "")) router.refresh();
    return { error: res?.error || "Could not reject" };
  }

  return (
    <>
      <div className={`grid gap-3 ${canReject ? "grid-cols-2" : "grid-cols-1"}`}>
        <button type="button" onClick={() => setDialog("approve")} className={`${btn} min-h-12 bg-green-600 text-white hover:bg-green-700`}>
          <Check size={18} />
          Approve
        </button>
        {canReject && (
          <button type="button" onClick={() => setDialog("reject")} className={`${btn} min-h-12 border border-red-300 bg-white text-red-600 hover:bg-red-50`}>
            <X size={18} />
            Reject
          </button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "approve"}
        title="Approve this expense?"
        message={`${summary}. Once approved it counts in your totals, reports and the cash closing.`}
        confirmLabel="Approve"
        successMessage="Expense approved"
        onConfirm={approve}
        onCancel={() => setDialog(null)}
      />
      <VoidDialog
        open={dialog === "reject"}
        title="Reject this expense?"
        description={`${summary}. It will never be counted in your totals. The reason is recorded and the person who entered it can see it.`}
        submitLabel="Reject expense"
        successMessage="Expense rejected"
        onSubmit={reject}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
