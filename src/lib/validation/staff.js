import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/constants";
import { todayKarachi } from "@/lib/dates";
import { currentMonth, MONTH_RE } from "@/lib/salary";
import { rupeeField } from "@/lib/validation/order";

// Shared by the browser forms and the server actions (the server always re-parses).

const dateKey = (msg) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const notFuture = (d) => d <= todayKarachi();
const objectId = (msg) => z.string().regex(/^[a-f\d]{24}$/i, msg);

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name").max(80, "Keep this under 80 characters"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number is too long")
    .refine((v) => v === "" || /^[+\d][\d\s-]{6,18}$/.test(v), "Enter a valid phone number")
    .default(""),
  cnic: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{5}-?\d{7}-?\d$/.test(v), "CNIC must be 13 digits, like 35202-1234567-1")
    .default(""),
  role: z.string().trim().max(50, "Keep this under 50 characters").default(""),
  wageType: z.enum(["monthly", "daily"], { error: "Choose monthly or daily" }),
  wageAmount: rupeeField({ min: 1, minMessage: "Enter the wage", label: "wage" }),
  joinDate: z
    .string()
    .refine((d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d), "Choose a valid date")
    .refine((d) => d === "" || notFuture(d), "The join date can't be in the future")
    .default(""),
  active: z.boolean().default(true),
});

export const advanceSchema = z.object({
  staffId: objectId("Choose the staff member"),
  amount: rupeeField({ min: 1, minMessage: "Amount must be at least Rs 1" }),
  method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
  date: dateKey("Choose a date").refine(notFuture, "The date can't be in the future"),
  note: z.string().trim().max(300, "Keep the note under 300 characters").default(""),
});

export const salaryInputSchema = z.object({
  staffId: objectId("Choose the staff member"),
  month: z.string().regex(MONTH_RE, "Choose the month").refine((m) => m <= currentMonth(), "You can't pay a future month"),
  bonus: rupeeField({ label: "bonus" }).default(0),
  otherDeduction: rupeeField({ label: "deduction" }).default(0),
  advanceDeducted: rupeeField({ label: "advance deduction" }).default(0),
  method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
  date: dateKey("Choose a date").refine(notFuture, "The date can't be in the future"),
  override: z.boolean().default(false), // admin only: pay a month that already has a payment
});

export const attendanceSchema = z.object({
  staffId: objectId("Invalid staff member"),
  date: dateKey("Choose a date").refine(notFuture, "You can't mark attendance for a future date"),
  status: z.enum(["present", "absent", "half_day"], { error: "Invalid status" }),
});
