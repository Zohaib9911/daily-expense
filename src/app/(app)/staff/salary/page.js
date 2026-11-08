import { redirect } from "next/navigation";

// /staff/salary itself has no page of its own: the Pay Salary form lives at /staff/salary/new.
export default function SalaryIndex() {
  redirect("/staff/salary/new");
}
