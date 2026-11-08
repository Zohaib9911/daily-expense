"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { changeOrderStatus } from "./actions";
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btn } from "@/lib/ui";

const FORWARD = new Set(["in_production", "ready", "delivered"]);

/** Status buttons for an order: the allowed next steps, with a confirmation where it matters. */
export default function OrderStatusActions({ id, status, balance, received }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [pending, setPending] = useState(null); // status awaiting confirmation
  const options = ORDER_TRANSITIONS[status] || [];
  if (!options.length) return null;

  // Used by the buttons directly (no confirmation) and by the confirm dialog (which shows the error itself).
  async function apply(next, { fromDialog = false } = {}) {
    const res = await guard.run(() => changeOrderStatus(id, next), { relock: false });
    if (!res) return; // second tap while the first change is still running
    if (res.ok) {
      setPending(null);
      if (!fromDialog) toast.success(`Order marked ${ORDER_STATUS_LABELS[next].toLowerCase()}`);
      router.refresh();
      return;
    }
    const error = res.error || "Could not change the status";
    if (!fromDialog) toast.error(error);
    return { error };
  }

  const needsConfirm = (next) => next === "cancelled" || (next === "delivered" && balance > 0);

  function click(next) {
    if (needsConfirm(next)) setPending(next);
    else apply(next);
  }

  const confirmCopy = {
    cancelled: {
      title: "Cancel this order?",
      message:
        received > 0
          ? `${formatPKR(received)} has already been received. Cancelling doesn't refund it or remove the payments, and no more payments can be received.`
          : "No more payments can be received on a cancelled order.",
      label: "Cancel order",
      danger: true,
    },
    delivered: {
      title: "Mark as delivered?",
      message: `${formatPKR(balance)} is still unpaid on this order. Mark it delivered anyway?`,
      label: "Mark delivered",
      danger: false,
    },
  };
  const copy = pending ? confirmCopy[pending] : null;

  return (
    <>
      <div className="grid gap-2">
        {options.map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => click(next)}
            disabled={guard.busy}
            className={`${btn} min-h-12 w-full ${
              next === "cancelled"
                ? "border border-red-300 bg-white text-red-600 hover:bg-red-50"
                : FORWARD.has(next)
                  ? "bg-blue-900 text-white hover:bg-blue-950"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {FORWARD.has(next) ? `Mark ${ORDER_STATUS_LABELS[next]}` : next === "cancelled" ? "Cancel order" : `Move back to ${ORDER_STATUS_LABELS[next]}`}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(copy)}
        title={copy?.title || ""}
        message={copy?.message}
        confirmLabel={copy?.label}
        danger={copy?.danger}
        successMessage={pending ? `Order marked ${ORDER_STATUS_LABELS[pending].toLowerCase()}` : undefined}
        onConfirm={() => apply(pending, { fromDialog: true })}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
