"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Loader2, Plus, X } from "lucide-react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import PhotoPicker from "@/components/PhotoPicker";
import { createOrder } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { formatPKR } from "@/lib/format";
import { lineTotal, orderSchema } from "@/lib/validation/order";
import { zodResolver } from "@/lib/zod-resolver";

const digits = (e) => (e.target.value = e.target.value.replace(/\D/g, ""));
const decimal = (e) => (e.target.value = e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"));
const num = (v) => Number(String(v ?? "").replace(/[,\s]/g, "")) || 0;
const emptyItem = { name: "", qty: "1", rate: "" };

function Err({ message }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

export default function OrderForm({ today }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState("");
  const [photosBusy, setPhotosBusy] = useState(false); // a photo is still uploading

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      address: "",
      items: [emptyItem],
      discount: "",
      advance: "",
      advanceMethod: "cash",
      orderDate: today,
      deliveryDate: "",
      notes: "",
      photos: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const [items, discountText, advanceText, advanceMethod, photos] = useWatch({
    control,
    name: ["items", "discount", "advance", "advanceMethod", "photos"],
  });
  const total = (items || []).reduce((s, it) => s + (lineTotal({ qty: num(it?.qty), rate: num(it?.rate) }) || 0), 0);
  const discount = num(discountText);
  const net = total - discount;
  const advance = num(advanceText);
  const balance = net - advance;

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); setPhotosBusy(false);
  });

  async function onSubmit(values) {
    setServerError("");
    if (photosBusy) return toast.error("Wait for the photos to finish uploading");
    const res = await guard.run(() => createOrder(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      if (res.warning) toast.error("Order saved, but its advance payment was not recorded. Check the order.");
      else toast.success("Order saved");
      // A warning means the order exists but its advance wasn't recorded: show the order (it explains).
      router.push(`/orders/${res.id}${res.warning ? "?notice=advance" : ""}`);
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

  const itemsError = errors.items?.message || errors.items?.root?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please check the highlighted fields"))} className="space-y-4" noValidate>
      <Card title="Customer" className="space-y-4">
        <div>
          <Label htmlFor="customerName">Customer name</Label>
          <input id="customerName" autoComplete="off" className={inputClass} {...register("customerName")} />
          <Err message={errors.customerName?.message} />
        </div>
        <div>
          <Label htmlFor="customerPhone">Phone (optional)</Label>
          <input id="customerPhone" type="tel" inputMode="tel" autoComplete="off" placeholder="0300-1234567" className={inputClass} {...register("customerPhone")} />
          <Err message={errors.customerPhone?.message} />
        </div>
        <div>
          <Label htmlFor="address">Address (optional)</Label>
          <textarea id="address" rows={2} className={`${inputClass} py-3`} {...register("address")} />
          <Err message={errors.address?.message} />
        </div>
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
                    <input id={`item-name-${i}`} autoComplete="off" placeholder="e.g. 3-seater sofa" className={inputClass} {...register(`items.${i}.name`)} />
                    <Err message={e?.name?.message} />
                  </div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={`Remove item ${i + 1}`}
                      className="mt-7 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
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
                    <Label htmlFor={`item-rate-${i}`}>Rate (Rs)</Label>
                    <input id={`item-rate-${i}`} inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register(`items.${i}.rate`, { onChange: digits })} />
                    <Err message={e?.rate?.message} />
                  </div>
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

      <Card title="Amounts" className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-900">{formatPKR(total)}</span>
        </div>
        <div>
          <Label htmlFor="discount">Discount (Rs)</Label>
          <input id="discount" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("discount", { onChange: digits })} />
          <Err message={errors.discount?.message} />
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="font-semibold text-slate-900">Net amount</span>
          <span className="text-xl font-bold text-slate-900">{formatPKR(net)}</span>
        </div>
        <div>
          <Label htmlFor="advance">Advance received (Rs)</Label>
          <input id="advance" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0" className={inputClass} {...register("advance", { onChange: digits })} />
          <Err message={errors.advance?.message} />
        </div>
        {advance > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Advance paid by</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="min-w-0">
                  <input type="radio" value={m} {...register("advanceMethod")} className="peer sr-only" />
                  <span
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                      advanceMethod === m ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </span>
                </label>
              ))}
            </div>
            <Err message={errors.advanceMethod?.message} />
          </fieldset>
        )}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
          <span className="font-semibold text-slate-900">Balance to receive</span>
          <MoneyText amount={balance} type={balance > 0 ? "out" : "in"} className="text-lg" />
        </div>
      </Card>

      <Card title="Furniture photos" className="space-y-3">
        <PhotoPicker
          label="Photos of the furniture"
          value={photos || []}
          onChange={(next) => setValue("photos", next, { shouldValidate: true, shouldDirty: true })}
          onBusyChange={setPhotosBusy}
          hint="Shown on the order and printed small on the invoice."
          error={errors.photos?.message || errors.photos?.root?.message}
        />
      </Card>

      <Card title="Dates and notes" className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label htmlFor="orderDate">Order date</Label>
            <input id="orderDate" type="date" max={today} className={inputClass} {...register("orderDate")} />
            <Err message={errors.orderDate?.message} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="deliveryDate">Delivery date</Label>
            <input id="deliveryDate" type="date" className={inputClass} {...register("deliveryDate")} />
            <Err message={errors.deliveryDate?.message} />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea id="notes" rows={3} className={`${inputClass} py-3`} {...register("notes")} />
          <Err message={errors.notes?.message} />
        </div>
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || guard.busy || photosBusy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : photosBusy ? "Uploading photos..." : "Save order"}
      </button>
    </form>
  );
}
