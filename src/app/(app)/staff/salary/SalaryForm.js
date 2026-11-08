"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { paySalary } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { salaryInputSchema } from "@/lib/validation/staff";
import { zodResolver } from "@/lib/zod-resolver";

const digits = (e) => (e.target.value = e.target.value.replace(/\D/g, ""));
const num = (v) => Number(String(v ?? "").replace(/\D/g, "")) || 0;

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

/**
 * `gross` and `outstanding` come from the server (calculated from attendance and the advance
 * records); they are shown here and re-calculated again when saving.
 * `mustOverride`: this month already has a payment and the user is the owner, who must tick "pay again".
 */
export default function SalaryForm({ staffId, month, gross, outstanding, today, mustOverride }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const suggested = Math.min(outstanding, gross);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(salaryInputSchema),
    defaultValues: {
      staffId,
      month,
      bonus: "",
      otherDeduction: "",
      advanceDeducted: suggested > 0 ? String(suggested) : "",
      method: "cash",
      date: today,
      override: false,
    },
  });
  const [bonusT, otherT, advT, method, override] = useWatch({ control, name: ["bonus", "otherDeduction", "advanceDeducted", "method", "override"] });
  const bonus = num(bonusT);
  const other = num(otherT);
  const adv = num(advT);
  const net = gross + bonus - adv - other;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); 
  });

  async function onSubmit(values) {
    setServerError("");
    if (mustOverride && !override) return setServerError("Tick the box to pay this month again.");
    if (adv > outstanding) return setError("advanceDeducted", { type: "client", message: `Only ${formatPKR(outstanding)} of advances is outstanding` });
    if (net < 0) return setError("otherDeduction", { type: "client", message: "The deductions are more than the salary" });
    const res = await guard.run(() => paySalary(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success("Salary paid");
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
      <input type="hidden" {...register("staffId")} />
      <input type="hidden" {...register("month")} />

      <Card title="Deductions and bonus" className="space-y-4">
        <div>
          <Label htmlFor="advanceDeducted">Advance to deduct (Rs)</Label>
          <input id="advanceDeducted" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("advanceDeducted", { onChange: digits })} />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Outstanding: <MoneyText amount={outstanding} type={outstanding > 0 ? "out" : "neutral"} /></p>
            {outstanding > 0 && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setValue("advanceDeducted", String(suggested), { shouldValidate: true })} className={`${btnGhost} min-h-11`}>Max</button>
                <button type="button" onClick={() => setValue("advanceDeducted", "", { shouldValidate: true })} className={`${btnGhost} min-h-11`}>None</button>
              </div>
            )}
          </div>
          <Err message={errors.advanceDeducted?.message} />
        </div>
        <div>
          <Label htmlFor="bonus">Bonus (Rs)</Label>
          <input id="bonus" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("bonus", { onChange: digits })} />
          <Err message={errors.bonus?.message} />
        </div>
        <div>
          <Label htmlFor="otherDeduction">Other deduction (Rs)</Label>
          <input id="otherDeduction" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("otherDeduction", { onChange: digits })} />
          <Err message={errors.otherDeduction?.message} />
        </div>
      </Card>

      <Card title="Net pay">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Gross salary</dt><dd className="font-semibold">{formatPKR(gross)}</dd></div>
          {bonus > 0 && <div className="flex justify-between"><dt className="text-slate-600">+ Bonus</dt><dd className="font-semibold text-green-600">{formatPKR(bonus)}</dd></div>}
          {adv > 0 && <div className="flex justify-between"><dt className="text-slate-600">− Advance deducted</dt><dd className="font-semibold text-red-600">{formatPKR(adv)}</dd></div>}
          {other > 0 && <div className="flex justify-between"><dt className="text-slate-600">− Other deduction</dt><dd className="font-semibold text-red-600">{formatPKR(other)}</dd></div>}
        </dl>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
          <span className="font-semibold text-slate-900">Net paid</span>
          <MoneyText amount={net} type={net < 0 ? "out" : "neutral"} className="text-2xl" />
        </div>
        {net < 0 && <p className="mt-2 text-sm text-red-600">The deductions are more than the salary.</p>}
      </Card>

      <Card className="space-y-4">
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
          <Label htmlFor="date">Payment date</Label>
          <input id="date" type="date" max={today} className={inputClass} {...register("date")} />
          <Err message={errors.date?.message} />
        </div>
        {mustOverride && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900">
            <input type="checkbox" className="h-5 w-5 rounded border-amber-400" {...register("override")} />
            Pay this month again (owner only)
          </label>
        )}
        <p className="text-xs text-slate-500">
          {net > 0 ? `This also records a "Salary" expense of ${formatPKR(net)}.` : "No cash is paid, so no expense is recorded."}
        </p>
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : `Pay ${formatPKR(Math.max(net, 0))}`}
      </button>
    </form>
  );
}
