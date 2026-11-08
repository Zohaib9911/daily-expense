"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import VoidDialog from "@/components/ui/VoidDialog";
import { unlockDay } from "./actions";
import { btnGhost } from "@/lib/ui";

/** Owner only. Reopens a closed day; the reason is saved with the closing and in the audit log. */
export default function UnlockDayButton({ id, dateLabel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function submit(reason) {
    const res = await unlockDay(id, reason);
    if (res?.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    return { error: res?.error || "Could not unlock the day" };
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btnGhost} min-h-12 w-full`}>
        <LockOpen size={18} />
        Unlock this day
      </button>
      <VoidDialog
        open={open}
        title="Unlock this day?"
        description={`${dateLabel} will be open again: managers can add and change entries for it, and the day must be closed again afterwards. The reason is recorded.`}
        submitLabel="Unlock day"
        successMessage="Day unlocked"
        onSubmit={submit}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
