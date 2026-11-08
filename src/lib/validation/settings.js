import { z } from "zod";
import { rupeeField } from "@/lib/validation/order";

/** Shared by the browser form and the server action. All amounts are whole rupees. */
export const settingsSchema = z.object({
  shopName: z.string().trim().min(2, "Enter the shop name (at least 2 characters)").max(60, "Keep the shop name under 60 characters"),
  receiptRequiredAbove: rupeeField({ min: 0, label: "receipt limit" }),
  approvalRequiredAbove: rupeeField({ min: 0, label: "approval limit" }),
  openingCashBalance: rupeeField({ min: 0, label: "opening cash" }),
});

export const SETTINGS_FIELDS = ["shopName", "receiptRequiredAbove", "approvalRequiredAbove", "openingCashBalance"];
