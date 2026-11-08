import mongoose from "mongoose";
import { requirePageRole } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import { outstandingByStaff } from "@/lib/staff-money";
import Staff from "@/models/Staff";
import AdvanceForm from "../AdvanceForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Give advance" };

export default async function NewAdvancePage({ searchParams }) {
  await requirePageRole(WRITER_ROLES);
  const sp = await searchParams;
  const pre = Array.isArray(sp.staff) ? sp.staff[0] : sp.staff;

  await connectDB();
  const [staff, owed] = await Promise.all([Staff.find({ active: true }).sort({ name: 1 }).lean(), outstandingByStaff()]);
  const list = staff.map((s) => ({ id: String(s._id), name: s.name, role: s.role || "", due: owed.get(String(s._id)) || 0 }));
  const initialStaffId = pre && mongoose.isValidObjectId(pre) && list.some((s) => s.id === pre) ? pre : "";

  return <FreshOnVisit resetKey={initialStaffId || ""}><AdvanceForm staff={list} initialStaffId={initialStaffId} today={todayKarachi()} /></FreshOnVisit>;
}
