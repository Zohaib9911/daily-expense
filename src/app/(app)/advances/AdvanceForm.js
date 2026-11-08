"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Info, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { giveAdvance } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btnPrimary, inputClass } from "@/lib/ui";
import { advanceSchema } from "@/lib/validation/staff";
import { zodResolver } from "@/lib/zod-resolver";

function Err({ message }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}
const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
    {children}
  </label>
);

/** `staff`: [{ id, name, role, due }] (due = advance not yet recovered). */
export default function AdvanceForm({ staff, initialStaffId, today }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(advanceSchema),
    defaultValues: { staffId: initialStaffId || "", amount: "", method: "cash", date: today, note: "" },
  });
  const [staffId, amountText, method] = useWatch({ control, name: ["staffId", "amount", "method"] });
  const chosen = staff.find((s) => s.id === staffId);
  const amount = Number(String(amountText || "").replace(/\D/g, "")) || 0;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); 
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => giveAdvance(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success("Advance recorded");
      router.push(`/staff/${res.staffId}`);
      router.refresh();
      return;
    }
    if (res?.fieldErrors) for (const [k, message] of Object.entries(res.fieldErrors)) setError(k, { type: "server", message });
    const message = res?.error || "Something went wrong. Please try again.";
    setServerError(message);
    toast.error(message);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please check the highlighted fields"))} className="space-y-4" noValidate>
      <Card className="space-y-4">
        <div>
          <Label htmlFor="staffId">Staff member</Label>
          <select id="staffId" className={inputClass} {...register("staffId")}>
            <option value="">Choose...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.role ? ` (${s.role})` : ""}
              </option>
            ))}
          </select>
          <Err message={errors.staffId?.message} />
          {chosen && chosen.due > 0 && (
            <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Info size={18} className="mt-0.5 shrink-0" />
              {chosen.name} already owes {formatPKR(chosen.due)} in advances.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="amount">Advance amount (PKR)</Label>
          <input
            id="amount"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            className={`${inputClass} min-h-14 text-2xl font-bold tabular-nums`}
            {...register("amount", { onChange: (e) => (e.target.value = e.target.value.replace(/\D/g, "")) })}
          />
          {amount > 0 && <p className="mt-1 text-sm font-semibold text-red-600">{formatPKR(amount)}</p>}
          <Err message={errors.amount?.message} />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Paid by</legend>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="min-w-0">
                <input type="radio" value={m} {...register("method")} className="peer sr-only" />
                <span
                  className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                    method === m ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {METHOD_LABELS[m]}
                </span>
              </label>
            ))}
          </div>
          <Err message={errors.method?.message} />
        </fieldset>

        <div>
          <Label htmlFor="date">Date</Label>
          <input id="date" type="date" max={today} className={inputClass} {...register("date")} />
          <Err message={errors.date?.message} />
        </div>
        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <textarea id="note" rows={2} className={`${inputClass} py-3`} {...register("note")} />
          <Err message={errors.note?.message} />
        </div>
        <p className="text-xs text-slate-500">This also records a &quot;Staff Advance&quot; expense for the same amount.</p>
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : "Give advance"}
      </button>
    </form>
  );
}
