import { requirePageRole } from "@/lib/auth-helpers";
import { todayKarachi } from "@/lib/dates";
import { WRITER_ROLES } from "@/lib/nav";
import OrderForm from "../OrderForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  await requirePageRole(WRITER_ROLES);
  return <FreshOnVisit><OrderForm today={todayKarachi()} /></FreshOnVisit>;
}
