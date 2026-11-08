import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/format";

/** Plain-text khata summary for WhatsApp. `ledger` is the result of ledgerFor(). */
export function buildLedgerMessage(shopName, supplier, ledger) {
  const { opening, entries, totals } = ledger;
  const live = entries.filter((e) => !e.voided);
  const lines = [`*${shopName}*`, `Account statement: ${supplier.name}`, ""];
  if (opening !== 0) lines.push(`Opening balance: ${formatPKR(opening)}`);
  lines.push(`Total purchases: ${formatPKR(live.filter((e) => e.kind === "purchase").reduce((s, e) => s + e.debit, 0))}`);
  lines.push(`Total paid: ${formatPKR(totals.credit)}`);
  lines.push(
    totals.balance > 0 ? `*Balance due to you: ${formatPKR(totals.balance)}*` : totals.balance < 0 ? `*Advance with you: ${formatPKR(-totals.balance)}*` : "*Account settled*"
  );

  const recent = live.slice(-8).reverse();
  if (recent.length) {
    lines.push("", "Recent entries:");
    for (const e of recent) {
      const what = e.kind === "purchase" ? `Purchase ${formatPKR(e.debit)}` : e.kind === "paid_at_purchase" ? `Paid with purchase ${formatPKR(e.credit)}` : `Payment ${formatPKR(e.credit)}`;
      lines.push(`${formatDate(e.date)}: ${what}`);
    }
  }
  lines.push("", "Thank you!");
  return lines.join("\n");
}
