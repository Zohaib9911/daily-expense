import mongoose from "mongoose";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { dayKey, todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import Staff from "@/models/Staff";
import StaffForm from "../../StaffForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Edit staff" };

export default async function EditStaffPage({ params }) {
  const { id } = await params;
  await requirePageRole(WRITER_ROLES);
  if (!mongoose.isValidObjectId(id)) notFound();
  await connectDB();
  const s = await Staff.findById(id).lean();
  if (!s) notFound();

  return (
    <FreshOnVisit><StaffForm
      mode="edit"
      staffId={id}
      today={todayKarachi()}
      initial={{
        name: s.name,
        role: s.role || "",
        phone: s.phone || "",
        cnic: s.cnic || "",
        wageType: s.wageType,
        wageAmount: String(s.wageAmount),
        joinDate: s.joinDate ? dayKey(s.joinDate) : "",
        active: s.active,
      }}
    /></FreshOnVisit>
  );
}
