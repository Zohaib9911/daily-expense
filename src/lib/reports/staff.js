import SalaryPayment from "@/models/SalaryPayment";
import Staff from "@/models/Staff";
import StaffAdvance from "@/models/StaffAdvance";
import { METHOD_LABELS } from "@/lib/constants";
import { monthLabel } from "@/lib/salary";
import { outstandingByStaff } from "@/lib/staff-money";
import { inRange, sumBy } from "@/lib/reports/common";

// Staff report. Salary paid = net cash paid (SalaryPayment.netPaid dated in the range). Advances given = advances
// dated in the range. Recovered = advance amounts deducted from salaries paid in the range. Outstanding = what is
// still owed back today (not limited to the range).
export async function buildStaffReport(r) {
  const [staff, salaries, advances, owed] = await Promise.all([
    Staff.find().sort({ active: -1, name: 1 }).lean(),
    SalaryPayment.find(inRange(r)).sort({ date: 1, createdAt: 1 }).populate("staff", "name").lean(),
    StaffAdvance.find(inRange(r)).sort({ date: 1, createdAt: 1 }).populate("staff", "name").lean(),
    outstandingByStaff(),
  ]);

  const key = (id) => String(id);
  const per = new Map(staff.map((s) => [key(s._id), { name: s.name, role: s.role || "", active: s.active, gross: 0, bonus: 0, recovered: 0, other: 0, net: 0, given: 0, outstanding: owed.get(key(s._id)) || 0 }]));
  for (const p of salaries) {
    const x = per.get(key(p.staff?._id ?? p.staff));
    if (!x) continue;
    x.gross += p.grossAmount;
    x.bonus += p.bonus;
    x.recovered += p.advanceDeducted;
    x.other += p.otherDeduction;
    x.net += p.netPaid;
  }
  for (const a of advances) {
    const x = per.get(key(a.staff?._id ?? a.staff));
    if (x) x.given += a.amount;
  }
  // Show people who have activity, are still active, or still owe money.
  const rows = [...per.values()].filter((x) => x.active || x.gross || x.given || x.outstanding);

  return {
    key: "staff",
    title: "Staff report",
    filename: "staff-report",
    range: r,
    summary: [
      { label: "Salary paid (net)", value: sumBy(rows, "net"), kind: "money", tone: "out" },
      { label: "Advances given", value: sumBy(rows, "given"), kind: "money", tone: "out" },
      { label: "Advances recovered", value: sumBy(rows, "recovered"), kind: "money", tone: "in" },
      { label: "Still owed back (today)", value: sumBy(rows, "outstanding"), kind: "money", tone: sumBy(rows, "outstanding") > 0 ? "out" : "neutral" },
    ],
    tables: [
      {
        id: "staff",
        title: "By staff member",
        columns: [
          { key: "name", label: "Staff", type: "text", w: 3 },
          { key: "role", label: "Role", type: "text", w: 2 },
          { key: "gross", label: "Gross salary", type: "money" },
          { key: "bonus", label: "Bonus", type: "money" },
          { key: "recovered", label: "Advance recovered", type: "money", tone: "in" },
          { key: "other", label: "Other deduction", type: "money" },
          { key: "net", label: "Net paid", type: "money", tone: "out" },
          { key: "given", label: "Advances given", type: "money", tone: "out" },
          { key: "outstanding", label: "Still owed back", type: "money", tone: "out" },
        ],
        rows,
        totals: { name: "Total", gross: sumBy(rows, "gross"), bonus: sumBy(rows, "bonus"), recovered: sumBy(rows, "recovered"), other: sumBy(rows, "other"), net: sumBy(rows, "net"), given: sumBy(rows, "given"), outstanding: sumBy(rows, "outstanding") },
      },
      {
        id: "salaries",
        title: "Salary payments",
        columns: [
          { key: "date", label: "Paid on", type: "date", link: true },
          { key: "staff", label: "Staff", type: "text", w: 3 },
          { key: "month", label: "For month", type: "text", w: 2 },
          { key: "gross", label: "Gross", type: "money" },
          { key: "bonus", label: "Bonus", type: "money" },
          { key: "adv", label: "Advance deducted", type: "money" },
          { key: "other", label: "Other deduction", type: "money" },
          { key: "net", label: "Net paid", type: "money", tone: "out" },
          { key: "method", label: "Paid by", type: "text" },
        ],
        rows: salaries.map((p) => ({ date: p.date, staff: p.staff?.name || "", month: monthLabel(p.month), gross: p.grossAmount, bonus: p.bonus, adv: p.advanceDeducted, other: p.otherDeduction, net: p.netPaid, method: METHOD_LABELS[p.method] || p.method, _href: `/staff/${p.staff?._id}` })),
        totals: { date: "Total", gross: sumBy(salaries, "grossAmount"), bonus: sumBy(salaries, "bonus"), adv: sumBy(salaries, "advanceDeducted"), other: sumBy(salaries, "otherDeduction"), net: sumBy(salaries, "netPaid") },
      },
      {
        id: "advances",
        title: "Advances given",
        columns: [
          { key: "date", label: "Date", type: "date", link: true },
          { key: "staff", label: "Staff", type: "text", w: 3 },
          { key: "amount", label: "Amount", type: "money", tone: "out" },
          { key: "recovered", label: "Recovered so far", type: "money", tone: "in" },
          { key: "due", label: "Still due", type: "money", tone: "out" },
          { key: "method", label: "Paid by", type: "text" },
          { key: "note", label: "Note", type: "text", w: 3 },
        ],
        rows: advances.map((a) => ({ date: a.date, staff: a.staff?.name || "", amount: a.amount, recovered: a.recoveredAmount, due: a.amount - a.recoveredAmount, method: METHOD_LABELS[a.method] || a.method, note: a.note || "", _href: `/staff/${a.staff?._id}` })),
        totals: { date: "Total", amount: sumBy(advances, "amount"), recovered: sumBy(advances, "recoveredAmount"), due: advances.reduce((s, a) => s + a.amount - a.recoveredAmount, 0) },
      },
    ],
  };
}
