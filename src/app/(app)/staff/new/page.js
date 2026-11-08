import { requirePageRole } from "@/lib/auth-helpers";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import StaffForm from "../StaffForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  await requirePageRole(WRITER_ROLES);
  const today = todayKarachi();
  return (
    <FreshOnVisit><StaffForm
      mode="create"
      today={today}
      initial={{ name: "", role: "", phone: "", cnic: "", wageType: "monthly", wageAmount: "", joinDate: today, active: true }}
    /></FreshOnVisit>
  );
}
