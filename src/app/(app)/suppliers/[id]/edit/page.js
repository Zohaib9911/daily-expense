import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { WRITER_ROLES } from "@/lib/nav";
import Supplier from "@/models/Supplier";
import SupplierForm from "../../SupplierForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }) {
  const { id } = await params;
  await requirePageRole(WRITER_ROLES);
  if (!mongoose.isValidObjectId(id)) notFound();
  await connectDB();
  const s = await Supplier.findById(id).lean();
  if (!s) notFound();
  const opening = s.openingBalance || 0;

  return (
    <FreshOnVisit><SupplierForm
      mode="edit"
      supplierId={id}
      initial={{
        name: s.name,
        phone: s.phone || "",
        address: s.address || "",
        openingBalance: opening ? String(Math.abs(opening)) : "",
        openingDirection: opening < 0 ? "they_owe" : "we_owe",
        active: s.active,
      }}
    /></FreshOnVisit>
  );
}
