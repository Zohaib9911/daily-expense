import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { WRITER_ROLES } from "@/lib/nav";
import Order from "@/models/Order";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/orders/search?q=... -> open orders that still have a balance (for "Receive Payment").
// With &scope=all -> any order, whatever its status or balance (for linking an expense to an order).
// Matches customer name, order number or phone digits. Admin/manager only.
export async function GET(req) {
  try {
    await requireRole(WRITER_ROLES);
  } catch (e) {
    return authErrorResponse(e);
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 60);
  const all = new URL(req.url).searchParams.get("scope") === "all";
  const filter = all ? {} : { status: { $ne: "cancelled" }, balance: { $gt: 0 } };
  if (q) {
    const digits = q.replace(/\D/g, "");
    filter.$or = [
      { customerName: new RegExp(escapeRegex(q), "i") },
      { orderNo: new RegExp(escapeRegex(q), "i") },
      ...(digits.length >= 3 ? [{ customerPhone: new RegExp(digits.split("").join("\\D*")) }] : []),
    ];
  }

  await connectDB();
  const docs = await Order.find(filter).sort({ createdAt: -1 }).limit(8).lean();
  return NextResponse.json(
    docs.map((o) => ({
      id: String(o._id),
      orderNo: o.orderNo,
      customerName: o.customerName,
      customerPhone: o.customerPhone || "",
      netAmount: o.netAmount,
      received: o.advanceReceived,
      balance: o.netAmount - o.advanceReceived,
      status: o.status,
    }))
  );
}
