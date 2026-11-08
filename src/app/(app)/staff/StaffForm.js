"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { createStaff, updateStaff } from "./actions";
import { btnPrimary, inputClass } from "@/lib/ui";
import { formatPKR } from "@/lib/format";
import { staffSchema } from "@/lib/validation/staff";
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

/** Add (mode="create") or edit (mode="edit", staffId) a staff member. */
export default function StaffForm({ mode = "create", staffId, initial, today }) {
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
  } = useForm({ resolver: zodResolver(staffSchema), defaultValues: initial });
  const [wageType, wageText, active] = useWatch({ control, name: ["wageType", "wageAmount", "active"] });
  const wage = Number(String(wageText || "").replace(/\D/g, "")) || 0;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    if (mode === "create") { reset();  }
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => (mode === "edit" ? updateStaff(staffId, values) : createStaff(values)));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success(mode === "edit" ? "Staff details updated" : "Staff member added");
      router.push(`/staff/${res.id}`);
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
          <Label htmlFor="name">Name</Label>
          <input id="name" autoComplete="off" className={inputClass} {...register("name")} />
          <Err message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="role">Role (optional)</Label>
          <input id="role" autoComplete="off" placeholder="e.g. Carpenter, Polisher, Helper" className={inputClass} {...register("role")} />
          <Err message={errors.role?.message} />
        </div>
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0300-1234567" className={inputClass} {...register("phone")} />
          <Err message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="cnic">CNIC (optional)</Label>
          <input id="cnic" inputMode="numeric" autoComplete="off" placeholder="35202-1234567-1" className={inputClass} {...register("cnic")} />
          <Err message={errors.cnic?.message} />
        </div>
      </Card>

      <Card className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Wage type</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["monthly", "Monthly"],
              ["daily", "Daily"],
            ].map(([v, label]) => (
              <label key={v} className="min-w-0">
                <input type="radio" value={v} {...register("wageType")} className="peer sr-only" />
                <span
                  className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                    wageType === v ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
          <Err message={errors.wageType?.message} />
        </fieldset>
        <div>
          <Label htmlFor="wageAmount">{wageType === "daily" ? "Wage per day (PKR)" : "Wage per month (PKR)"}</Label>
          <input
            id="wageAmount"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            className={`${inputClass} min-h-14 text-xl font-bold tabular-nums`}
            {...register("wageAmount", { onChange: (e) => (e.target.value = e.target.value.replace(/\D/g, "")) })}
          />
          {wage > 0 && <p className="mt-1 text-sm font-semibold text-slate-700">{formatPKR(wage)}</p>}
          <Err message={errors.wageAmount?.message} />
        </div>
        <div>
          <Label htmlFor="joinDate">Join date (optional)</Label>
          <input id="joinDate" type="date" max={today} className={inputClass} {...register("joinDate")} />
          <Err message={errors.joinDate?.message} />
        </div>
        {mode === "edit" && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800">
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300" {...register("active")} />
            <span>
              Active staff member
              {!active && <span className="block text-xs font-normal text-slate-500">Inactive staff are hidden from attendance and can&apos;t be given advances.</span>}
            </span>
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
        {isSubmitting || guard.busy ? "Saving..." : mode === "edit" ? "Save changes" : "Add staff"}
      </button>
    </form>
  );
}
