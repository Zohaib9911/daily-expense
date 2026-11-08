import mongoose from "mongoose";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { balancesFor } from "@/lib/supplier-money";
import Supplier from "@/models/Supplier";
import PaySupplierForm from "../PaySupplierForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Pay supplier" };

export default async function PaySupplierPage({ searchParams }) {
  await requirePageRole(WRITER_ROLES);
  const sp = await searchParams;
  const pre = Array.isArray(sp.supplier) ? sp.supplier[0] : sp.supplier;

  await connectDB();
  const docs = await Supplier.find({ active: true }).sort({ name: 1 }).lean();
  const balances = await balancesFor(docs);
  const list = docs.map((s) => ({ id: String(s._id), name: s.name, due: balances.get(String(s._id))?.due ?? 0 }));
  const initialSupplierId = pre && mongoose.isValidObjectId(pre) && list.some((s) => s.id === pre) ? pre : "";

  return <FreshOnVisit resetKey={initialSupplierId || ""}><PaySupplierForm suppliers={list} initialSupplierId={initialSupplierId} today={todayKarachi()} /></FreshOnVisit>;
}
