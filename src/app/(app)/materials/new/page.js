import mongoose from "mongoose";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import Settings from "@/models/Settings";
import Supplier from "@/models/Supplier";
import MaterialForm from "../MaterialForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Buy material" };

export default async function NewPurchasePage({ searchParams }) {
  await requirePageRole(WRITER_ROLES);
  const sp = await searchParams;
  const pre = Array.isArray(sp.supplier) ? sp.supplier[0] : sp.supplier;

  await connectDB();
  const [docs, settings] = await Promise.all([Supplier.find({ active: true }).sort({ name: 1 }).lean(), Settings.getSingleton()]);
  const suppliers = docs.map((s) => ({ id: String(s._id), name: s.name }));
  const initialSupplierId = pre && mongoose.isValidObjectId(pre) && suppliers.some((s) => s.id === pre) ? pre : "";

  return <FreshOnVisit resetKey={initialSupplierId || ""}><MaterialForm suppliers={suppliers} initialSupplierId={initialSupplierId} today={todayKarachi()} receiptRequiredAbove={settings.receiptRequiredAbove} /></FreshOnVisit>;
}
