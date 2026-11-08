import Order from "@/models/Order";
import Expense from "@/models/Expense";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { costsByOrder, orderProfit } from "@/lib/order-profit";
import { inRange, pct, sumBy } from "@/lib/reports/common";

// Profit / loss per order, for orders DATED in the range. The cost of an order is ALL its approved linked expenses,
// whenever they were spent (an order made in October can still get powder-coating costs in November).
// Pending-approval costs are shown separately and not counted. Cancelled orders count only what was received.
// Expenses that are not linked to any order (rent, salaries, electricity...) are shown on the side as "overhead":
// the real shop profit is on the Profit & Loss report.
export async function buildOrderProfit(r) {
  const orders = await Order.find(inRange(r, "orderDate")).sort({ orderDate: 1, createdAt: 1 }).lean();
  const costs = await costsByOrder(orders.map((o) => o._id));

  const [unlinked] = await Expense.aggregate([
    { $match: { ...inRange(r), status: "approved", order: null } },
    { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } },
  ]);

  const rows = orders.map((o) => {
    const c = costs.get(String(o._id));
    const p = orderProfit(o, c.cost);
    return {
      orderNo: o.orderNo,
      date: o.orderDate,
      customer: o.customerName,
      status: ORDER_STATUS_LABELS[o.status] || o.status,
      value: p.revenue,
      received: o.advanceReceived,
      cost: p.cost,
      pending: c.pending,
      profit: p.profit,
      margin: p.margin ?? 0,
      _href: `/orders/${o._id}`,
    };
  });

  const value = sumBy(rows, "value");
  const cost = sumBy(rows, "cost");
  const profit = value - cost;
  const withCosts = rows.filter((x) => x.cost > 0).length;
  const losers = rows.filter((x) => x.profit < 0);
  const best = [...rows].sort((a, b) => b.profit - a.profit)[0];

  return {
    key: "order-profit",
    title: "Order profit",
    filename: "order-profit-report",
    range: r,
    summary: [
      { label: "Orders", value: rows.length, kind: "int" },
      { label: "Order value", value, kind: "money" },
      { label: "Spent on these orders", value: cost, kind: "money", tone: "out" },
      { label: "Profit on these orders", value: profit, kind: "money", tone: "auto" },
      { label: "Orders making a loss", value: losers.length, kind: "int", tone: losers.length ? "out" : "neutral" },
      { label: "Orders with costs entered", value: `${withCosts} of ${rows.length}`, kind: "text" },
      { label: "Best order", value: best ? `${best.orderNo} (Rs ${Math.round(best.profit).toLocaleString("en-US")})` : "—", kind: "text" },
      { label: "Other expenses, not linked to an order", value: unlinked?.total ?? 0, kind: "money", tone: "out" },
    ],
    tables: [
      {
        id: "orders",
        title: "Profit by order",
        note: "Profit = order value minus approved expenses linked to the order (cancelled orders: only the money received). Costs waiting for approval are not counted. An order with no costs entered shows its full value as profit, so check the 'Spent' column. Margin = profit / value. Tap an order number to open it.",
        columns: [
          { key: "orderNo", label: "Order", type: "text", link: true },
          { key: "date", label: "Date", type: "date" },
          { key: "customer", label: "Customer", type: "text", w: 3 },
          { key: "status", label: "Status", type: "text", w: 2 },
          { key: "value", label: "Value", type: "money" },
          { key: "cost", label: "Spent", type: "money", tone: "out" },
          { key: "pending", label: "Awaiting approval", type: "money" },
          { key: "profit", label: "Profit / loss", type: "money", tone: "auto" },
          { key: "margin", label: "Margin", type: "pct" },
        ],
        rows,
        totals: { orderNo: "Total", value, cost, pending: sumBy(rows, "pending"), profit, margin: pct(profit, value) },
      },
    ],
  };
}
