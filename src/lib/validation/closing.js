import { z } from "zod";
import { rupeeField } from "@/lib/validation/order";

// Shared by the closing form and the server action.
export const closeDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day"),
    actualCounted: rupeeField({ label: "counted cash" }),
    note: z.string().trim().max(500, "Keep the note under 500 characters").default(""),
    // What the user saw on screen: the server refuses to close if it changed in the meantime.
    expectedSeen: z.number().int().optional(),
    // Owner only, first closing only.
    openingOverride: z.number().int().min(0).optional(),
  });
