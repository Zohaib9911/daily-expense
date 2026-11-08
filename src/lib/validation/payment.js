import { z } from "zod";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "@/lib/constants";
import { todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { rupeeField } from "@/lib/validation/order";
import { RECEIPT_URL_RE } from "@/lib/validation/expense";

/**
 * Shared by the browser form and the server action.
 * `balance`: the linked order's remaining balance (number) or null when no order is linked.
 * The browser passes what it last saw; the server passes the real, current figure.
 */
export function paymentSchema({ balance = null } = {}) {
  return z
    .object({
      orderId: z.string().regex(/^([a-f\d]{24})?$/i, "Invalid order").default(""),
      type: z.enum(PAYMENT_TYPES, { error: "Choose the payment type" }),
      amount: rupeeField({ min: 1, minMessage: "Amount must be at least Rs 1" }),
      method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
        .refine((d) => d <= todayKarachi(), "The date can't be in the future"),
      note: z.string().trim().max(500, "Keep the note under 500 characters").default(""),
      receiptUrl: z.union([z.literal(""), z.string().regex(RECEIPT_URL_RE, "Invalid receipt")]).default(""),
    })
    .superRefine((v, ctx) => {
      if (v.orderId) {
        if (v.type === "other_income") {
          ctx.addIssue({ code: "custom", path: ["type"], message: "A payment for an order must be an advance or a balance payment" });
        }
        if (balance !== null && v.amount > balance) {
          ctx.addIssue({
            code: "custom",
            path: ["amount"],
            message:
              balance > 0
                ? `You can't receive more than the order balance (${formatPKR(balance)})`
                : "This order has no balance left to receive",
          });
        }
      } else {
        if (v.type !== "other_income") {
          ctx.addIssue({ code: "custom", path: ["type"], message: "Choose the order this payment is for" });
        }
        if (!v.note) {
          ctx.addIssue({ code: "custom", path: ["note"], message: "Describe the income in the note" });
        }
      }
    });
}
