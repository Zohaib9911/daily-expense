import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { waNumber } from "@/lib/phone";

/** Plain-text order summary for WhatsApp. `order` is a lean Order doc. */
export function buildOrderMessage(shopName, order) {
  const lines = [
    `*${shopName}*`,
    `Order ${order.orderNo} · ${formatDate(order.orderDate)}`,
    `Customer: ${order.customerName}`,
    "",
    "Items:",
    ...order.items.map((it, i) => `${i + 1}. ${it.name}: ${it.qty} x ${formatPKR(it.rate)} = ${formatPKR(it.total)}`),
    "",
    `Total: ${formatPKR(order.totalAmount)}`,
  ];
  if (order.discount > 0) lines.push(`Discount: ${formatPKR(order.discount)}`);
  lines.push(`Net amount: ${formatPKR(order.netAmount)}`, `Received: ${formatPKR(order.advanceReceived)}`);
  const balance = order.netAmount - order.advanceReceived;
  lines.push(balance > 0 ? `*Balance: ${formatPKR(balance)}*` : "*Paid in full*");
  if (order.deliveryDate) lines.push(`Delivery: ${formatDate(order.deliveryDate)}`);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

/** wa.me link: opens the customer's chat when their number is usable, otherwise WhatsApp's contact picker. */
export function whatsappLink(phone, text) {
  const number = waNumber(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
