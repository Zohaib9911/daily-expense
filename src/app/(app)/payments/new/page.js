import mongoose from "mongoose";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import Order from "@/models/Order";
import PaymentForm from "../PaymentForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Receive payment" };

export default async function NewPaymentPage({ searchParams }) {
  await requirePageRole(WRITER_ROLES);
  const sp = await searchParams;
  const orderId = Array.isArray(sp.order) ? sp.order[0] : sp.order;

  // ?order=<id> (from an order's "Receive Payment" button) pre-links that order.
  let initialOrder = null;
  if (orderId && mongoose.isValidObjectId(orderId)) {
    await connectDB();
    const o = await Order.findById(orderId).lean();
    if (o && o.status !== "cancelled" && o.netAmount - o.advanceReceived > 0) {
      initialOrder = {
        id: String(o._id),
        orderNo: o.orderNo,
        customerName: o.customerName,
        customerPhone: o.customerPhone || "",
        netAmount: o.netAmount,
        received: o.advanceReceived,
        balance: o.netAmount - o.advanceReceived,
        status: o.status,
      };
    }
  }

  return <FreshOnVisit resetKey={initialOrder?.id || ""}><PaymentForm initialOrder={initialOrder} today={todayKarachi()} /></FreshOnVisit>;
}
