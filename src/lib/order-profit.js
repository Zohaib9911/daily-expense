import mongoose from "mongoose";
import Expense from "@/models/Expense";

// Server-only. Profit / loss of a customer order.
//   cost    = APPROVED expenses linked to the order (Expense.order). Voided and rejected ones never count (model guard +
//             status filter); pending-approval ones are reported separately and NOT counted until the owner approves them.
//   revenue = the order's net amount (what the customer agreed to pay). For a CANCELLED order only what was actually
//             received is kept, so that is used instead.
//   profit  = revenue - cost.  "In hand so far" = received - cost (cash view).
// Expenses are already one row per money-out (a salary/advance/purchase creates exactly one Expense), so nothing is counted twice.

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Map orderId -> { cost, costCount, pending, pendingCount } for the given order ids. */
export async function costsByOrder(orderIds) {
  const ids = orderIds.map(oid);
  const map = new Map(ids.map((id) => [String(id), { cost: 0, costCount: 0, pending: 0, pendingCount: 0 }]));
  if (!ids.length) return map;
  const rows = await Expense.aggregate([
    { $match: { order: { $in: ids }, status: { $in: ["approved", "pending_approval"] } } }, // voided are left out by default
    { $group: { _id: { order: "$order", status: "$status" }, total: { $sum: "$amount" }, n: { $sum: 1 } } },
  ]);
  for (const r of rows) {
    const m = map.get(String(r._id.order));
    if (!m) continue;
    if (r._id.status === "approved") {
      m.cost = r.total;
      m.costCount = r.n;
    } else {
      m.pending = r.total;
      m.pendingCount = r.n;
    }
  }
  return map;
}

/** Figures for one order from its lean doc and its approved cost. */
export function orderProfit(order, cost) {
  const cancelled = order.status === "cancelled";
  const revenue = cancelled ? order.advanceReceived : order.netAmount;
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? profit / revenue : null, // fraction, e.g. 0.18
    inHand: order.advanceReceived - cost, // cash received so far minus what was spent on it
    cancelled,
  };
}
