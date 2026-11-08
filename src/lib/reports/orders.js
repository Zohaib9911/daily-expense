import AuditLog from "@/models/AuditLog";
import Order from "@/models/Order";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { inRange, sumBy } from "@/lib/reports/common";

// Order report. "Created" = orders dated in the range. "Delivered" = orders whose status was changed to
// delivered in the range (from the audit log, so it counts deliveries made in the period whatever their order date).
export async function buildOrderReport(r) {
  const [created, deliveredLogs, pendingByCustomer] = await Promise.all([
    Order.find(inRange(r, "orderDate")).sort({ orderDate: 1, createdAt: 1 }).lean(),
    AuditLog.find({ collectionName: "orders", action: "update", "newValue.status": "delivered", timestamp: { $gte: r.start, $lt: r.end } }).lean(),
    // All-time open balances (not limited to the range): what customers still owe today.
    Order.aggregate([
      { $match: { status: { $ne: "cancelled" }, balance: { $gt: 0 } } },
      {
        $group: {
          _id: { $ifNull: ["$customerPhone", "$customerName"] },
          customer: { $first: "$customerName" },
          phone: { $first: "$customerPhone" },
          orders: { $sum: 1 },
          net: { $sum: "$netAmount" },
          received: { $sum: "$advanceReceived" },
          balance: { $sum: "$balance" },
        },
      },
      { $sort: { balance: -1 } },
    ]),
  ]);

  const deliveredIds = [...new Set(deliveredLogs.map((l) => String(l.recordId)))];
  const delivered = deliveredIds.length ? await Order.find({ _id: { $in: deliveredIds } }).lean() : [];

  const live = created.filter((o) => o.status !== "cancelled");
  const value = sumBy(live, "netAmount");
  const received = sumBy(live, "advanceReceived");
  const balance = sumBy(live, "balance");

  // by customer (orders created in range)
  const byCust = new Map();
  for (const o of live) {
    const key = o.customerPhone || o.customerName;
    const c = byCust.get(key) ?? { customer: o.customerName, phone: o.customerPhone || "", orders: 0, net: 0, received: 0, balance: 0 };
    c.orders += 1;
    c.net += o.netAmount;
    c.received += o.advanceReceived;
    c.balance += o.balance;
    byCust.set(key, c);
  }
  const custRows = [...byCust.values()].sort((a, b) => b.net - a.net);

  return {
    key: "orders",
    title: "Order report",
    filename: "order-report",
    range: r,
    summary: [
      { label: "Orders created", value: created.length, kind: "int" },
      { label: "Total order value", value: value, kind: "money" },
      { label: "Received so far", value: received, kind: "money", tone: "in" },
      { label: "Still to receive", value: balance, kind: "money", tone: balance > 0 ? "out" : "neutral" },
      { label: "Delivered in period", value: delivered.length, kind: "int" },
      { label: "Delivered value", value: sumBy(delivered, "netAmount"), kind: "money" },
    ],
    tables: [
      {
        id: "orders",
        title: "Orders created",
        note: "Cancelled orders are listed but not counted in the totals.",
        columns: [
          { key: "orderNo", label: "Order", type: "text", link: true },
          { key: "date", label: "Date", type: "date" },
          { key: "customer", label: "Customer", type: "text", w: 3 },
          { key: "status", label: "Status", type: "text", w: 2 },
          { key: "net", label: "Value", type: "money" },
          { key: "received", label: "Received", type: "money", tone: "in" },
          { key: "balance", label: "Balance", type: "money", tone: "out" },
          { key: "delivery", label: "Delivery", type: "date" },
        ],
        rows: created.map((o) => ({ orderNo: o.orderNo, date: o.orderDate, customer: o.customerName, status: ORDER_STATUS_LABELS[o.status] || o.status, net: o.netAmount, received: o.advanceReceived, balance: o.status === "cancelled" ? 0 : o.balance, delivery: o.deliveryDate || null, _href: `/orders/${o._id}` })),
        totals: { orderNo: "Total", net: value, received, balance },
      },
      {
        id: "customers",
        title: "By customer (orders created in this period)",
        columns: [
          { key: "customer", label: "Customer", type: "text", w: 3 },
          { key: "phone", label: "Phone", type: "text", w: 2 },
          { key: "orders", label: "Orders", type: "int" },
          { key: "net", label: "Value", type: "money" },
          { key: "received", label: "Received", type: "money", tone: "in" },
          { key: "balance", label: "Balance", type: "money", tone: "out" },
        ],
        rows: custRows,
        totals: { customer: "Total", orders: live.length, net: value, received, balance },
      },
      {
        id: "pending",
        title: "Pending balances by customer (all time, today)",
        note: "Everything customers still owe, whatever the order date. Cancelled orders are excluded.",
        columns: [
          { key: "customer", label: "Customer", type: "text", w: 3 },
          { key: "phone", label: "Phone", type: "text", w: 2 },
          { key: "orders", label: "Open orders", type: "int" },
          { key: "net", label: "Value", type: "money" },
          { key: "received", label: "Received", type: "money", tone: "in" },
          { key: "balance", label: "Balance", type: "money", tone: "out" },
        ],
        rows: pendingByCustomer.map((x) => ({ customer: x.customer, phone: x.phone || "", orders: x.orders, net: x.net, received: x.received, balance: x.balance })),
        totals: { customer: "Total", orders: sumBy(pendingByCustomer, "orders"), net: sumBy(pendingByCustomer, "net"), received: sumBy(pendingByCustomer, "received"), balance: sumBy(pendingByCustomer, "balance") },
      },
    ],
  };
}
