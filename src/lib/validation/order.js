import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/constants";
import { todayKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { RECEIPT_URL_RE } from "@/lib/validation/expense";

export const MAX_ORDER_PHOTOS = 6;

// Shared by the browser form and the server action (the server always re-parses).

const MAX_RUPEES = 100_000_000;
const stripCommas = (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v);

/** Whole-rupee field: "" counts as 0, "12,500" -> 12500. */
export const rupeeField = ({ min = 0, minMessage, label = "amount" } = {}) =>
  z.preprocess(
    stripCommas,
    z.coerce
      .number({ error: `Enter the ${label}` })
      .int("Whole rupees only")
      .min(min, minMessage || `Enter the ${label}`)
      .max(MAX_RUPEES, "That amount is too large")
  );

/** Quantity: positive, at most 2 decimals. */
export const qtyField = z.preprocess(
  stripCommas,
  z.coerce
    .number({ error: "Enter the quantity" })
    .positive("Enter the quantity")
    .max(100_000, "Quantity is too large")
    .refine((q) => Math.abs(q * 100 - Math.round(q * 100)) < 1e-6, "At most 2 decimals")
);

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter the item name").max(100, "Keep this under 100 characters"),
  qty: qtyField,
  rate: rupeeField({ min: 1, minMessage: "Enter the rate", label: "rate" }),
});

export const lineTotal = (it) => Math.round(Number(it.qty) * Number(it.rate));

export const orderSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter the customer's name").max(80, "Keep this under 80 characters"),
    customerPhone: z
      .string()
      .trim()
      .max(20, "Phone number is too long")
      .refine((v) => v === "" || /^[+\d][\d\s-]{6,18}$/.test(v), "Enter a valid phone number")
      .default(""),
    address: z.string().trim().max(200, "Keep this under 200 characters").default(""),
    items: z.array(itemSchema).min(1, "Add at least one item").max(50, "Too many items"),
    discount: rupeeField({ label: "discount" }).default(0),
    advance: rupeeField({ label: "advance" }).default(0),
    advanceMethod: z.enum(PAYMENT_METHODS, { error: "Choose how the advance was paid" }).default("cash"),
    orderDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the order date")
      .refine((d) => d <= todayKarachi(), "The order date can't be in the future"),
    deliveryDate: z
      .string()
      .refine((d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d), "Choose a valid date")
      .default(""),
    notes: z.string().trim().max(500, "Keep the notes under 500 characters").default(""),
    // Optional furniture photos: only URLs that /api/upload returned.
    photos: z
      .array(z.string().regex(RECEIPT_URL_RE, "Invalid photo"))
      .max(MAX_ORDER_PHOTOS, `Add at most ${MAX_ORDER_PHOTOS} photos`)
      .default([]),
  })
  .superRefine((v, ctx) => {
    const total = v.items.reduce((s, it) => s + lineTotal(it), 0);
    const net = total - v.discount;
    if (v.discount > total) {
      ctx.addIssue({ code: "custom", path: ["discount"], message: "The discount can't be more than the total" });
    } else if (net < 1) {
      ctx.addIssue({ code: "custom", path: ["discount"], message: "The net amount must be at least Rs 1" });
    } else if (v.advance > net) {
      ctx.addIssue({
        code: "custom",
        path: ["advance"],
        message: `The advance can't be more than the net amount (${formatPKR(net)})`,
      });
    }
    if (v.deliveryDate && v.deliveryDate < v.orderDate) {
      ctx.addIssue({ code: "custom", path: ["deliveryDate"], message: "Delivery can't be before the order date" });
    }
  });
