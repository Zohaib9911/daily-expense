import mongoose from "mongoose";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth-helpers";
import { isDayLocked } from "@/lib/audit";
import { dayKey, todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import connectDB from "@/lib/db";
import Expense from "@/models/Expense";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import ExpenseForm from "../../ExpenseForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }) {
  const { id } = await params;
  const user = await requirePageRole(WRITER_ROLES);
  if (!mongoose.isValidObjectId(id)) notFound();

  await connectDB();
  const e = await Expense.findById(id).setOptions({ showVoided: true }).lean();
  if (!e) notFound();
  // Voided records can't be edited; a locked day can only be edited by the admin.
  if (e.isVoided || e.sourceType) redirect(`/expenses/${id}`);
  if (user.role !== "admin" && (await isDayLocked(e.date))) redirect(`/expenses/${id}`);

  const s = await Settings.getSingleton();
  const o = e.order ? await Order.findById(e.order).setOptions({ showVoided: true }).lean() : null;
  const initialOrder = o ? { id: String(o._id), orderNo: o.orderNo, customerName: o.customerName, netAmount: o.netAmount, received: o.advanceReceived, balance: o.netAmount - o.advanceReceived } : null;
  return (
    <FreshOnVisit><ExpenseForm
      mode="edit"
      expenseId={id}
      role={user.role}
      initialOrder={initialOrder}
      thresholds={{ receiptRequiredAbove: s.receiptRequiredAbove, approvalRequiredAbove: s.approvalRequiredAbove }}
      initial={{
        category: e.category,
        amount: e.amount,
        paidTo: e.paidTo || "",
        method: e.method,
        date: dayKey(e.date),
        note: e.note || "",
        receiptUrl: e.receiptUrl || "",
        today: todayKarachi(),
      }}
    /></FreshOnVisit>
  );
}
