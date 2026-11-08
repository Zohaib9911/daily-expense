import { requirePageRole } from "@/lib/auth-helpers";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";
import Order from "@/models/Order";
import Staff from "@/models/Staff";
import Supplier from "@/models/Supplier";
import mongoose from "mongoose";
import ExpenseForm from "../ExpenseForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Add expense" };

export default async function NewExpensePage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageRole(WRITER_ROLES);
  await connectDB();
  const s = await Settings.getSingleton();
  const today = todayKarachi();

  // /expenses/new?order=<id> (the button on an order) pre-links that order.
  const orderParam = Array.isArray(sp.order) ? sp.order[0] : sp.order;
  const o = mongoose.isValidObjectId(orderParam) ? await Order.findById(orderParam).lean() : null;
  const [staff, suppliers] = await Promise.all([
    Staff.find({ active: true }).sort({ name: 1 }).select("name role").lean(),
    Supplier.find({ active: true }).sort({ name: 1 }).select("name").lean(),
  ]);
  const initialOrder = o ? { id: String(o._id), orderNo: o.orderNo, customerName: o.customerName, netAmount: o.netAmount, received: o.advanceReceived, balance: o.netAmount - o.advanceReceived } : null;

  return (
    <FreshOnVisit resetKey={initialOrder?.id || ""}><ExpenseForm
      mode="create"
      role={user.role}
      initialOrder={initialOrder}
      staffOptions={staff.map((s) => ({ id: String(s._id), name: s.name, role: s.role || "" }))}
      supplierOptions={suppliers.map((s) => ({ id: String(s._id), name: s.name }))}
      thresholds={{ receiptRequiredAbove: s.receiptRequiredAbove, approvalRequiredAbove: s.approvalRequiredAbove }}
      initial={{ category: "", amount: "", paidTo: "", method: "cash", date: today, note: "", receiptUrl: "", staffId: "", supplierId: "", today }}
    /></FreshOnVisit>
  );
}
