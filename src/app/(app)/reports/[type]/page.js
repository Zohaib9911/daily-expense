import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileSpreadsheet, FileText } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { REPORTS } from "@/lib/reports";
import { periodSlug, reportRange } from "@/lib/reports/common";
import { daysInMonth } from "@/lib/salary";
import { btnGhost, btnPrimary } from "@/lib/ui";
import ExpenseDrill from "../ExpenseDrill";
import MonthPicker from "../MonthPicker";
import ReportView from "../ReportView";

export async function generateMetadata({ params }) {
  const { type } = await params;
  return { title: REPORTS[type]?.title || "Report" };
}

export default async function ReportPage({ params, searchParams }) {
  const { type } = await params;
  const def = REPORTS[type];
  if (!def) notFound();
  const user = await requirePageUser();
  if (def.adminOnly && user.role !== "admin") redirect("/reports");

  const sp = await searchParams;
  if (!sp.range) redirect(`/reports/${type}?range=month`); // reports default to "this month"
  const range = reportRange(sp);

  await connectDB();
  const report = await def.build(range);

  const qs = new URLSearchParams({ range: range.range });
  if (range.range === "custom") {
    qs.set("from", range.from);
    qs.set("to", range.to);
  }
  const exportHref = (format) => `/api/reports/${type}?format=${format}&${qs.toString()}`;
  const wholeMonth = range.from.endsWith("-01") && range.from.slice(0, 7) === range.to.slice(0, 7) && range.to === `${range.to.slice(0, 7)}-${String(daysInMonth(range.to.slice(0, 7))).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <Link href="/reports" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-900">
        <ChevronLeft size={16} />
        All reports
      </Link>

      <div>
        <h2 className="text-xl font-bold text-slate-900">{def.title}</h2>
        <p className="text-sm text-slate-500">{range.label}</p>
      </div>

      <Card className="space-y-4">
        <DateFilter />
        <MonthPicker current={wholeMonth ? range.from.slice(0, 7) : ""} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <a href={exportHref("xlsx")} download={`${report.filename}-${periodSlug(range)}.xlsx`} className={`${btnPrimary} min-h-12`}>
          <FileSpreadsheet size={18} />
          Excel
        </a>
        <a href={exportHref("pdf")} download={`${report.filename}-${periodSlug(range)}.pdf`} className={`${btnGhost} min-h-12`}>
          <FileText size={18} />
          PDF
        </a>
      </div>

      <ReportView report={report} />
      {report.drill && <ExpenseDrill groups={report.drill} />}
    </div>
  );
}
