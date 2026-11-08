"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { Save } from "lucide-react";
import Card from "@/components/ui/Card";
import { updateSettings } from "./actions";
import { settingsSchema } from "@/lib/validation/settings";
import { btnPrimary, inputClass } from "@/lib/ui";
import { formatPKR } from "@/lib/format";

const digits = (v) => String(v).replace(/\D/g, "");

function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

/** Shop name, receipt limit, approval limit and first-day opening cash. Same zod schema as the server. */
export default function SettingsForm({ initial }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useSubmitGuard();
  const [v, setV] = useState({
    shopName: initial.shopName,
    receiptRequiredAbove: String(initial.receiptRequiredAbove),
    approvalRequiredAbove: String(initial.approvalRequiredAbove),
    openingCashBalance: String(initial.openingCashBalance),
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // { ok, text }

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setNum = (k) => (e) => setV((p) => ({ ...p, [k]: digits(e.target.value) }));

  async function submit(e) {
    e.preventDefault();
    setStatus(null);
    const parsed = settingsSchema.safeParse(v);
    if (!parsed.success) {
      const fe = {};
      for (const i of parsed.error.issues) fe[i.path[0]] ??= i.message;
      setErrors(fe);
      toast.error("Please check the highlighted fields");
      return;
    }
    setErrors({});
    const res = await guard.run(() => updateSettings(parsed.data), { relock: false });
    if (!res) return;
    if (res.ok) {
      setStatus({ ok: true, text: res.message });
      toast.success(res.message);
      router.refresh();
    } else {
      setErrors(res.fieldErrors || {});
      const text = res.error || "Could not save";
      setStatus({ ok: false, text });
      toast.error(text);
    }
  }

  const approval = Number(v.approvalRequiredAbove) || 0;
  const receipt = Number(v.receiptRequiredAbove) || 0;

  return (
    <form onSubmit={submit} noValidate>
      <Card title="Shop settings" className="space-y-4">
        <Field id="shopName" label="Shop name" error={errors.shopName} hint="Shown in the sidebar and in the invoices you share.">
          <input id="shopName" value={v.shopName} onChange={set("shopName")} maxLength={60} autoComplete="off" className={inputClass} aria-invalid={!!errors.shopName} />
        </Field>

        <Field
          id="receiptRequiredAbove"
          label="Receipt required above (PKR)"
          error={errors.receiptRequiredAbove}
          hint={`An expense or purchase above ${formatPKR(receipt)} must have a photo of the receipt or bill.`}
        >
          <input id="receiptRequiredAbove" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={v.receiptRequiredAbove} onChange={setNum("receiptRequiredAbove")} className={inputClass} aria-invalid={!!errors.receiptRequiredAbove} />
        </Field>

        <Field
          id="approvalRequiredAbove"
          label="Approval required above (PKR)"
          error={errors.approvalRequiredAbove}
          hint={`A manager's expense above ${formatPKR(approval)} waits for your approval and is not counted until you approve it. Your own expenses are approved at once.`}
        >
          <input id="approvalRequiredAbove" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={v.approvalRequiredAbove} onChange={setNum("approvalRequiredAbove")} className={inputClass} aria-invalid={!!errors.approvalRequiredAbove} />
        </Field>

        <Field
          id="openingCashBalance"
          label="Opening cash balance, first day (PKR)"
          error={errors.openingCashBalance}
          hint="The cash in the drawer when you start using this app. It is the opening cash of the very first daily closing; later days carry on from each day's count."
        >
          <input id="openingCashBalance" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={v.openingCashBalance} onChange={setNum("openingCashBalance")} className={inputClass} aria-invalid={!!errors.openingCashBalance} />
        </Field>

        {status && (
          <p role={status.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${status.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {status.text}
          </p>
        )}

        <button type="submit" disabled={guard.busy} className={`${btnPrimary} min-h-12 w-full disabled:opacity-60`}>
          <Save size={18} />
          {guard.busy ? "Saving..." : "Save settings"}
        </button>
        <p className="text-xs text-slate-500">Every change is recorded in the Audit Log with the old and new values. Limits apply to new entries only.</p>
      </Card>
    </form>
  );
}
