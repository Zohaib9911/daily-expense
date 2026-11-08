import { requirePageRole } from "@/lib/auth-helpers";
import { WRITER_ROLES } from "@/lib/nav";
import SupplierForm from "../SupplierForm";
import FreshOnVisit from "@/components/FreshOnVisit";

export const metadata = { title: "Add supplier" };

export default async function NewSupplierPage() {
  await requirePageRole(WRITER_ROLES);
  return <FreshOnVisit><SupplierForm mode="create" initial={{ name: "", phone: "", address: "", openingBalance: "", openingDirection: "we_owe", active: true }} /></FreshOnVisit>;
}
