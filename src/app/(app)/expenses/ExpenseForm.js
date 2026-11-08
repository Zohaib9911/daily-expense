"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Info, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import ReceiptInput from "@/components/ReceiptInput";
import OrderPicker from "../payments/OrderPicker";
import { createExpense, updateExpense } from "./actions";
import { EXPENSE_CATEGORIES, METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { CATEGORY_META } from "@/lib/expense-meta";
import { formatPKR } from "@/lib/format";
import { btnPrimary, inputClass } from "@/lib/ui";
import { expenseSchema } from "@/lib/validation/expense";
import { zodResolver } from "@/lib/zod-resolver";


function FieldError({ message }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}

/**
 * Create (mode="create") or edit (mode="edit", pass expenseId) an expense.
 * `initial`: { category, amount, paidTo, method, date, note, receiptUrl }.
 */
export default function ExpenseForm({ mode = "create", expenseId, initial, thresholds, role, initialOrder = null }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const [order, setOrder] = useState(initialOrder); // the customer order this cost is for (optional)
  const schema = useMemo(() => expenseSchema(thresholds), [thresholds]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { ...initial, amount: initial.amount ? String(initial.amount) : "", orderId: initialOrder?.id || "" },
  });

  const [amountText, category, method, receiptUrl] = useWatch({
    control,
    name: ["amount", "category", "method", "receiptUrl"],
  });
  const amount = Number(String(amountText || "").replace(/\D/g, "")) || 0;
  const needsReceipt = amount > thresholds.receiptRequiredAbove;
  const needsApproval = amount > thresholds.approvalRequiredAbove && role !== "admin";

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    if (mode === "create") { reset(); setOrder(initialOrder); }
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => (mode === "edit" ? updateExpense(expenseId, values) : createExpense(values)));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success(mode === "edit" ? "Expense updated" : "Expense saved");
      router.push(`/expenses/${res.id}`);
      router.refresh();
      return;
    }
    if (res?.fieldErrors) {
      for (const [k, message] of Object.entries(res.fieldErrors)) setError(k, { type: "server", message });
    }
    const message = res?.error || "Something went wrong. Please try again.";
    setServerError(message);
    toast.error(message);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please check the highlighted fields"))} className="space-y-4" noValidate>
      <Card>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Category</legend>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const { label, icon: Icon } = CATEGORY_META[c];
              return (
                <label key={c} className="min-w-0">
                  <input type="radio" value={c} {...register("category")} className="peer sr-only" />
                  <span className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-1 text-center text-xs font-semibold leading-tight text-slate-700 peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-700 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
                    <Icon size={24} />
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError message={errors.category?.message} />
          {category === "raw_material" && (
            <p className="mt-3 flex gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <Info size={18} className="mt-0.5 shrink-0" />
              <span>
                Buying from a supplier? Use <Link href="/materials/new" className="font-semibold underline">Buy Material</Link> instead, so the supplier&apos;s balance stays correct and the cost isn&apos;t counted twice.
              </span>
            </p>
          )}
        </fieldset>
      </Card>

      <Card title="For a customer order (optional)">
        <OrderPicker
          scope="all"
          value={order}
          onChange={(o) => {
            setOrder(o);
            setValue("orderId", o ? o.id : "", { shouldDirty: true });
          }}
        />
        <p className="mt-2 text-xs text-slate-500">
          Pipes, rope, powder coating or anything bought for one order: choose the order and the cost is counted in that order&apos;s profit.
        </p>
        <FieldError message={errors.orderId?.message} />
      </Card>

      <Card className="space-y-4">
        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-slate-700">
            Amount (PKR)
          </label>
          <input
            id="amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            className={`${inputClass} min-h-14 text-2xl font-bold tabular-nums`}
            {...register("amount", { onChange: (e) => (e.target.value = e.target.value.replace(/\D/g, "")) })}
          />
          {amount > 0 && <p className="mt-1 text-sm font-semibold text-red-600">{formatPKR(amount)}</p>}
          <FieldError message={errors.amount?.message} />
          {needsApproval && (
            <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Info size={18} className="mt-0.5 shrink-0" />
              Above {formatPKR(thresholds.approvalRequiredAbove)}: this needs the owner&apos;s approval.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="paidTo" className="mb-1.5 block text-sm font-medium text-slate-700">
            Paid to (optional)
          </label>
          <input id="paidTo" type="text" autoComplete="off" className={inputClass} {...register("paidTo")} />
          <FieldError message={errors.paidTo?.message} />
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
          <FieldError message={errors.method?.message} />
        </fieldset>

        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Date
          </label>
          <input id="date" type="date" max={initial.today} className={inputClass} {...register("date")} />
          <FieldError message={errors.date?.message} />
        </div>

        <div>
          <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">
            Note{category === "misc" ? <span className="text-red-600"> (required for Misc)</span> : " (optional)"}
          </label>
          <textarea id="note" rows={3} className={`${inputClass} py-3`} {...register("note")} />
          <FieldError message={errors.note?.message} />
        </div>

        <ReceiptInput
          value={receiptUrl}
          onChange={(url) => setValue("receiptUrl", url, { shouldValidate: true, shouldDirty: true })}
          required={needsReceipt}
          error={errors.receiptUrl?.message}
        />
        {needsReceipt && !receiptUrl && (
          <p className="text-xs text-slate-500">A receipt is required above {formatPKR(thresholds.receiptRequiredAbove)}.</p>
        )}
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : mode === "edit" ? "Save changes" : "Save expense"}
      </button>
    </form>
  );
}
