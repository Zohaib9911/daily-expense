"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Info, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { paySupplier } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { supplierPaymentSchema } from "@/lib/validation/supplier";
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

/** `suppliers`: [{ id, name, due }] (due = what we owe now; negative = advance with them). */
export default function PaySupplierForm({ suppliers, initialSupplierId, today }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: { supplierId: initialSupplierId || "", amount: "", method: "cash", date: today, note: "" },
  });
  const [supplierId, amountText, method] = useWatch({ control, name: ["supplierId", "amount", "method"] });
  const chosen = suppliers.find((s) => s.id === supplierId);
  const amount = Number(String(amountText || "").replace(/\D/g, "")) || 0;
  const after = chosen ? chosen.due - amount : null;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); 
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => paySupplier(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success("Supplier payment recorded");
      router.push(`/suppliers/${res.supplierId}`);
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
          <Label htmlFor="supplierId">Supplier</Label>
          <select id="supplierId" className={inputClass} {...register("supplierId")}>
            <option value="">Choose...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Err message={errors.supplierId?.message} />
          {chosen && (
            <p className="mt-2 text-sm text-slate-600">
              {chosen.due >= 0 ? "We owe them: " : "Advance with them: "}
              <MoneyText amount={Math.abs(chosen.due)} type={chosen.due > 0 ? "out" : chosen.due < 0 ? "in" : "neutral"} />
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="amount">Amount paid (PKR)</Label>
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
          {chosen && chosen.due > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">{amount > 0 && after >= 0 ? `Due after: ${formatPKR(after)}` : `Due: ${formatPKR(chosen.due)}`}</p>
              <button type="button" onClick={() => setValue("amount", String(chosen.due), { shouldValidate: true })} className={`${btnGhost} min-h-11 shrink-0`}>
                Full due
              </button>
            </div>
          )}
          {chosen && amount > 0 && after < 0 && (
            <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Info size={18} className="mt-0.5 shrink-0" />
              This is more than you owe. The extra {formatPKR(-after)} will show as an advance with this supplier.
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Paid by</legend>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="min-w-0">
                <input type="radio" value={m} {...register("method")} className="peer sr-only" />
                <span className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${method === m ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"}`}>
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
        <p className="text-xs text-slate-500">This also records a &quot;Raw Material&quot; expense for the same amount.</p>
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : "Pay supplier"}
      </button>
    </form>
  );
}
