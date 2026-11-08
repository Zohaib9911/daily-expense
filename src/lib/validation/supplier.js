import { z } from "zod";
import { MATERIAL_UNITS, PAYMENT_METHODS } from "@/lib/constants";
import { todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { RECEIPT_URL_RE } from "@/lib/validation/expense";
import { lineTotal, qtyField, rupeeField } from "@/lib/validation/order";

// Shared by the browser forms and the server actions (the server always re-parses).

const objectId = (msg) => z.string().regex(/^[a-f\d]{24}$/i, msg);
const notFuture = (d) => d <= todayKarachi();

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier's name").max(80, "Keep this under 80 characters"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number is too long")
    .refine((v) => v === "" || /^[+\d][\d\s-]{6,18}$/.test(v), "Enter a valid phone number")
    .default(""),
  address: z.string().trim().max(200, "Keep this under 200 characters").default(""),
  openingBalance: rupeeField({ label: "opening balance" }).default(0),
  // "we_owe": we owe them (normal, positive balance). "they_owe": we paid in advance (stored negative).
  openingDirection: z.enum(["we_owe", "they_owe"]).default("we_owe"),
  active: z.boolean().default(true),
});

export const purchaseItemSchema = z.object({
  name: z.string().trim().min(1, "Enter the item name").max(100, "Keep this under 100 characters"),
  qty: qtyField,
  unit: z.enum(MATERIAL_UNITS, { error: "Choose a unit" }),
  rate: rupeeField({ min: 1, minMessage: "Enter the rate", label: "rate" }),
});

export function purchaseSchema({ receiptRequiredAbove }) {
  return z
    .object({
      supplierId: objectId("Choose the supplier"),
      items: z.array(purchaseItemSchema).min(1, "Add at least one item").max(50, "Too many items"),
      paidAmount: rupeeField({ label: "amount paid" }).default(0),
      method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }).default("cash"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").refine(notFuture, "The date can't be in the future"),
      receiptUrl: z.union([z.literal(""), z.string().regex(RECEIPT_URL_RE, "Invalid photo")]).default(""),
      note: z.string().trim().max(300, "Keep the note under 300 characters").default(""),
    })
    .superRefine((v, ctx) => {
      const total = v.items.reduce((s, it) => s + lineTotal(it), 0);
      if (total < 1) {
        ctx.addIssue({ code: "custom", path: ["items"], message: "The total must be at least Rs 1" });
        return;
      }
      if (v.paidAmount > total) {
        ctx.addIssue({ code: "custom", path: ["paidAmount"], message: `The amount paid can't be more than the total (${formatPKR(total)})` });
      }
      if (total > receiptRequiredAbove && !v.receiptUrl) {
        ctx.addIssue({ code: "custom", path: ["receiptUrl"], message: `A bill photo is required above ${formatPKR(receiptRequiredAbove)}` });
      }
    });
}

export const supplierPaymentSchema = z.object({
  supplierId: objectId("Choose the supplier"),
  amount: rupeeField({ min: 1, minMessage: "Amount must be at least Rs 1" }),
  method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").refine(notFuture, "The date can't be in the future"),
  note: z.string().trim().max(300, "Keep the note under 300 characters").default(""),
});
