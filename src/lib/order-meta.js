import { daysFromToday, formatDate } from "@/lib/dates";

const TONE = { red: "text-red-600", orange: "text-orange-600", slate: "text-slate-600" };

/**
 * How to show an order's delivery date: red when overdue, orange when due within 2 days,
 * plain otherwise. Delivered/cancelled orders are never flagged. Returns null with no date.
 */
export function deliveryInfo(deliveryDate, status) {
  if (!deliveryDate) return null;
  const date = formatDate(deliveryDate);
  if (status === "delivered" || status === "cancelled") return { text: date, className: TONE.slate };

  const d = daysFromToday(deliveryDate);
  if (d < 0) return { text: `${date} · overdue by ${-d} ${-d === 1 ? "day" : "days"}`, className: `${TONE.red} font-semibold` };
  if (d === 0) return { text: `${date} · due today`, className: `${TONE.orange} font-semibold` };
  if (d <= 2) return { text: `${date} · due ${d === 1 ? "tomorrow" : "in 2 days"}`, className: `${TONE.orange} font-semibold` };
  return { text: date, className: TONE.slate };
}
