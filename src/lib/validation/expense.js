import { z } from "zod";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";
import { todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

// Used by BOTH the browser form and the server action, so the rules can't drift apart.
// The server never trusts the browser's check: it parses again with the real Settings.

/** Receipts are only ever /api/files/receipts/YYYY/MM/<32 hex>.jpg (what /api/upload returns). */
export const RECEIPT_URL_RE = /^\/api\/files\/receipts\/\d{4}\/\d{2}\/[a-f0-9]{32}\.jpg$/;
export const MAX_AMOUNT = 100_000_000;

/** "/api/files/receipts/2026/11/abc.jpg" -> "/api/files/receipts/2026/11/abc-t.jpg" (small version). */
export const thumbUrl = (url) => (url ? url.replace(/\.jpg$/, "-t.jpg") : "");

export function expenseSchema({ receiptRequiredAbove }) {
  return z
    .object({
      category: z.enum(EXPENSE_CATEGORIES, { error: "Choose a category" }),
      amount: z.preprocess(
        (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
        z.coerce
          .number({ error: "Enter the amount" })
          .int("Whole rupees only")
          .min(1, "Amount must be at least Rs 1")
          .max(MAX_AMOUNT, "That amount is too large")
      ),
      paidTo: z.string().trim().max(100, "Keep this under 100 characters").default(""),
      method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
        .refine((d) => d <= todayKarachi(), "The date can't be in the future"),
      note: z.string().trim().max(500, "Keep the note under 500 characters").default(""),
      // Optional: link the cost to a customer order (checked against the database on the server).
      orderId: z.string().regex(/^([a-f\d]{24})?$/i, "Invalid order").default(""),
      receiptUrl: z.union([z.literal(""), z.string().regex(RECEIPT_URL_RE, "Invalid receipt")]).default(""),
    })
    .superRefine((v, ctx) => {
      if (v.category === "misc" && !v.note) {
        ctx.addIssue({ code: "custom", path: ["note"], message: "A note is required for Misc expenses" });
      }
      if (v.amount > receiptRequiredAbove && !v.receiptUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["receiptUrl"],
          message: `A receipt photo is required above ${formatPKR(receiptRequiredAbove)}`,
        });
      }
    });
}

/** Zod issues -> { field: "first message" } */
export function fieldErrors(error) {
  const out = {};
  for (const i of error.issues) {
    const k = i.path[0];
    if (k !== undefined && !out[k]) out[k] = i.message;
  }
  return out;
}
