"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { createSupplier, updateSupplier } from "./actions";
import { btnPrimary, inputClass } from "@/lib/ui";
import { formatPKR } from "@/lib/format";
import { supplierSchema } from "@/lib/validation/supplier";
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

/** Add (mode="create") or edit (mode="edit", supplierId) a supplier. */
export default function SupplierForm({ mode = "create", supplierId, initial }) {
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
  } = useForm({ resolver: zodResolver(supplierSchema), defaultValues: initial });
  const [openingText, direction] = useWatch({ control, name: ["openingBalance", "openingDirection"] });
  const opening = Number(String(openingText || "").replace(/\D/g, "")) || 0;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    if (mode === "create") { reset();  }
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => (mode === "edit" ? updateSupplier(supplierId, values) : createSupplier(values)));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success(mode === "edit" ? "Supplier updated" : "Supplier added");
      router.push(`/suppliers/${res.id}`);
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
          <Label htmlFor="name">Supplier name</Label>
          <input id="name" autoComplete="off" className={inputClass} {...register("name")} />
          <Err message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0300-1234567" className={inputClass} {...register("phone")} />
          <Err message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="address">Address (optional)</Label>
          <textarea id="address" rows={2} className={`${inputClass} py-3`} {...register("address")} />
          <Err message={errors.address?.message} />
        </div>
      </Card>

      <Card title="Opening balance" className="space-y-4">
        <p className="text-sm text-slate-600">What was owed between you and this supplier before you started using this app.</p>
        <fieldset>
          <legend className="sr-only">Who owes whom</legend>
          <div className="grid grid-cols-1 gap-2">
            {[
              ["we_owe", "We owe the supplier"],
              ["they_owe", "Supplier owes us (we paid in advance)"],
            ].map(([v, label]) => (
              <label key={v} className="min-w-0">
                <input type="radio" value={v} {...register("openingDirection")} className="peer sr-only" />
                <span
                  className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                    direction === v ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="openingBalance">Amount (PKR, 0 if none)</Label>
          <input
            id="openingBalance"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            className={`${inputClass} min-h-14 text-xl font-bold tabular-nums`}
            {...register("openingBalance", { onChange: (e) => (e.target.value = e.target.value.replace(/\D/g, "")) })}
          />
          {opening > 0 && <p className="mt-1 text-sm font-semibold text-slate-700">{formatPKR(opening)}</p>}
          <Err message={errors.openingBalance?.message} />
        </div>
        {mode === "edit" && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800">
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300" {...register("active")} />
            Active supplier
          </label>
        )}
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : mode === "edit" ? "Save changes" : "Add supplier"}
      </button>
    </form>
  );
}
