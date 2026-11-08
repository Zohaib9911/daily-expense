"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Info, Loader2, Plus, X } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import ReceiptInput from "@/components/ReceiptInput";
import { createPurchase } from "./actions";
import { MATERIAL_UNITS, METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { lineTotal } from "@/lib/validation/order";
import { purchaseSchema } from "@/lib/validation/supplier";
import { zodResolver } from "@/lib/zod-resolver";

const digits = (e) => (e.target.value = e.target.value.replace(/\D/g, ""));
const decimal = (e) => (e.target.value = e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"));
const num = (v) => Number(String(v ?? "").replace(/[,\s]/g, "")) || 0;
const emptyItem = { name: "", qty: "1", unit: "pcs", rate: "" };

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

/** `suppliers`: [{ id, name }]. `receiptRequiredAbove`: a bill photo is mandatory above this total. */
export default function MaterialForm({ suppliers, initialSupplierId, today, receiptRequiredAbove }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => purchaseSchema({ receiptRequiredAbove }), [receiptRequiredAbove]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { supplierId: initialSupplierId || "", items: [emptyItem], paidAmount: "", method: "cash", date: today, receiptUrl: "", note: "" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const [items, paidText, method, receiptUrl] = useWatch({ control, name: ["items", "paidAmount", "method", "receiptUrl"] });

  const total = (items || []).reduce((s, it) => s + (lineTotal({ qty: num(it?.qty), rate: num(it?.rate) }) || 0), 0);
  const paid = num(paidText);
  const due = total - paid;
  const needsBill = total > receiptRequiredAbove;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); 
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => createPurchase(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success("Purchase saved");
      router.push(`/materials/${res.id}`);
      router.refresh();
      return;
    }
    if (res?.fieldErrors) for (const [k, message] of Object.entries(res.fieldErrors)) setError(k, { type: "server", message });
    const message = res?.error || "Something went wrong. Please try again.";
    setServerError(message);
    toast.error(message);
  }

  const itemsError = errors.items?.message || errors.items?.root?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please check the highlighted fields"))} className="space-y-4" noValidate>
      <Card>
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
        {suppliers.length === 0 && <p className="mt-2 text-sm text-slate-500">No suppliers yet. Add one first from Suppliers.</p>}
      </Card>

      <Card title="Items">
        <ul className="space-y-3">
          {fields.map((field, i) => {
            const it = items?.[i];
            const line = lineTotal({ qty: num(it?.qty), rate: num(it?.rate) }) || 0;
            const e = errors.items?.[i];
            return (
              <li key={field.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`item-name-${i}`}>Item {i + 1}</Label>
                    <input id={`item-name-${i}`} autoComplete="off" placeholder="e.g. Sheesham wood" className={inputClass} {...register(`items.${i}.name`)} />
                    <Err message={e?.name?.message} />
                  </div>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(i)} aria-label={`Remove item ${i + 1}`} className="mt-7 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600">
                      <X size={20} />
                    </button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label htmlFor={`item-qty-${i}`}>Qty</Label>
                    <input id={`item-qty-${i}`} inputMode="decimal" autoComplete="off" className={inputClass} {...register(`items.${i}.qty`, { onChange: decimal })} />
                    <Err message={e?.qty?.message} />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor={`item-unit-${i}`}>Unit</Label>
                    <select id={`item-unit-${i}`} className={inputClass} {...register(`items.${i}.unit`)}>
                      {MATERIAL_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <Err message={e?.unit?.message} />
                  </div>
                </div>
                <div className="mt-3">
                  <Label htmlFor={`item-rate-${i}`}>Rate per {it?.unit || "unit"} (Rs)</Label>
                  <input id={`item-rate-${i}`} inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register(`items.${i}.rate`, { onChange: digits })} />
                  <Err message={e?.rate?.message} />
                </div>
                <p className="mt-2 text-right text-sm text-slate-500">
                  Line total: <span className="font-semibold text-slate-900">{formatPKR(line)}</span>
                </p>
              </li>
            );
          })}
        </ul>
        <Err message={itemsError} />
        <button type="button" onClick={() => append(emptyItem)} className={`${btnGhost} mt-3 w-full`}>
          <Plus size={18} />
          Add another item
        </button>
      </Card>

      <Card title="Payment" className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-xl font-bold text-slate-900">{formatPKR(total)}</span>
        </div>
        <div>
          <Label htmlFor="paidAmount">Amount paid now (Rs)</Label>
          <input id="paidAmount" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("paidAmount", { onChange: digits })} />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setValue("paidAmount", String(total), { shouldValidate: true })} className={`${btnGhost} min-h-11`}>Full amount</button>
            <button type="button" onClick={() => setValue("paidAmount", "", { shouldValidate: true })} className={`${btnGhost} min-h-11`}>Nothing now</button>
          </div>
          <Err message={errors.paidAmount?.message} />
        </div>
        {paid > 0 && (
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
        )}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
          <span className="font-semibold text-slate-900">Added to supplier due</span>
          <MoneyText amount={Math.max(due, 0)} type={due > 0 ? "out" : "neutral"} className="text-lg" />
        </div>
        <p className="flex gap-2 text-xs text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          {paid > 0 ? `The ${formatPKR(paid)} paid now is also recorded as a "Raw Material" expense. ` : ""}The unpaid rest becomes an expense when you pay the supplier.
        </p>
      </Card>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="date">Purchase date</Label>
          <input id="date" type="date" max={today} className={inputClass} {...register("date")} />
          <Err message={errors.date?.message} />
        </div>
        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <textarea id="note" rows={2} className={`${inputClass} py-3`} {...register("note")} />
          <Err message={errors.note?.message} />
        </div>
        <ReceiptInput
          label="Bill photo"
          value={receiptUrl}
          onChange={(url) => setValue("receiptUrl", url, { shouldValidate: true, shouldDirty: true })}
          required={needsBill}
          error={errors.receiptUrl?.message}
        />
        {needsBill && !receiptUrl && <p className="text-xs text-slate-500">A bill photo is required above {formatPKR(receiptRequiredAbove)}.</p>}
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : "Save purchase"}
      </button>
    </form>
  );
}
