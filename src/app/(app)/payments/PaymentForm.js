"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useResetWhenHidden, useSubmitGuard } from "@/lib/use-submit-guard";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import ReceiptInput from "@/components/ReceiptInput";
import OrderPicker from "./OrderPicker";
import { createPayment } from "./actions";
import { METHOD_LABELS, PAYMENT_METHODS, PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import { paymentSchema } from "@/lib/validation/payment";
import { zodResolver } from "@/lib/zod-resolver";

function Err({ message }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}

const defaultType = (order) => (!order ? "other_income" : order.received > 0 ? "order_balance" : "order_advance");

/** Receive a payment. `initialOrder`: an order to link up front ({ id, orderNo, customerName, received, balance }) or null. */
export default function PaymentForm({ initialOrder, today }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [order, setOrder] = useState(initialOrder);
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => paymentSchema({ balance: order ? order.balance : null }), [order]);

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
    defaultValues: {
      orderId: initialOrder?.id || "",
      type: defaultType(initialOrder),
      amount: "",
      method: "cash",
      date: today,
      note: "",
      receiptUrl: "",
    },
  });
  const [type, method, receiptUrl, amountText] = useWatch({ control, name: ["type", "method", "receiptUrl", "amount"] });
  const amount = Number(String(amountText || "").replace(/\D/g, "")) || 0;
  const after = order ? order.balance - amount : null;

  function pick(o) {
    setOrder(o);
    setValue("orderId", o ? o.id : "");
    setValue("type", defaultType(o));
  }

  // Hidden after a successful save (browser Back / Next keeps pages alive): start clean next time.
  useResetWhenHidden(guard, () => {
    setServerError("");
    reset(); setOrder(initialOrder);
  });

  async function onSubmit(values) {
    setServerError("");
    const res = await guard.run(() => createPayment(values));
    if (!res) return; // a second tap while the first save is still running
    if (res?.ok) {
      toast.success("Payment recorded");
      router.push(res.orderId ? `/orders/${res.orderId}` : `/payments/${res.id}`);
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
      <Card title="For an order (optional)">
        <OrderPicker value={order} onChange={pick} />
        <p className="mt-2 text-xs text-slate-500">Leave empty to record other income that isn&apos;t for an order.</p>
        <Err message={errors.orderId?.message} />
      </Card>

      <Card className="space-y-4">
        {order ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">This payment is</legend>
            <div className="grid grid-cols-2 gap-2">
              {["order_advance", "order_balance"].map((t) => (
                <label key={t} className="min-w-0">
                  <input type="radio" value={t} {...register("type")} className="peer sr-only" />
                  <span
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                      type === t ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {PAYMENT_TYPE_LABELS[t]}
                  </span>
                </label>
              ))}
            </div>
            <Err message={errors.type?.message} />
          </fieldset>
        ) : (
          <>
            <input type="hidden" {...register("type")} />
            <p className="text-sm text-slate-600">
              Type: <span className="font-semibold text-slate-900">{PAYMENT_TYPE_LABELS.other_income}</span>
            </p>
            <Err message={errors.type?.message} />
          </>
        )}

        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-slate-700">
            Amount received (PKR)
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
          {amount > 0 && <p className="mt-1 text-sm font-semibold text-green-600">{formatPKR(amount)}</p>}
          <Err message={errors.amount?.message} />
          {order && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {amount > 0 && after >= 0 ? `Balance after: ${formatPKR(after)}` : `Balance: ${formatPKR(order.balance)}`}
              </p>
              <button
                type="button"
                onClick={() => setValue("amount", String(order.balance), { shouldValidate: true })}
                className={`${btnGhost} min-h-11 shrink-0`}
              >
                Full balance
              </button>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Received by</legend>
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
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Date
          </label>
          <input id="date" type="date" max={today} className={inputClass} {...register("date")} />
          <Err message={errors.date?.message} />
        </div>

        <div>
          <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">
            Note{order ? " (optional)" : <span className="text-red-600"> (required for other income)</span>}
          </label>
          <textarea id="note" rows={3} className={`${inputClass} py-3`} {...register("note")} />
          <Err message={errors.note?.message} />
        </div>

        <ReceiptInput
          value={receiptUrl}
          onChange={(url) => setValue("receiptUrl", url, { shouldValidate: true, shouldDirty: true })}
          required={false}
          error={errors.receiptUrl?.message}
        />
      </Card>

      {serverError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || guard.busy} className={`${btnPrimary} min-h-14 w-full text-base`}>
        {(isSubmitting || guard.busy) && <Loader2 size={18} className="animate-spin" />}
        {isSubmitting || guard.busy ? "Saving..." : "Save payment"}
      </button>
    </form>
  );
}
