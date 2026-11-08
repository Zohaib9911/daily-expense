import { NextResponse } from "next/server";
import { authErrorResponse, requireAuth } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { REPORTS } from "@/lib/reports";
import { periodSlug, reportRange } from "@/lib/reports/common";
import { reportToExcel } from "@/lib/reports/excel";
import { reportToPdf } from "@/lib/reports/pdf";
import { getShopName } from "@/lib/shop";

const TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

// GET /api/reports/<type>?format=xlsx|pdf&range=month|week|today|custom&from=&to=
// Same data and same role rules as the report page. File name example: expense-report-2026-10.xlsx
export async function GET(req, { params }) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return authErrorResponse(e);
  }

  const { type } = await params;
  const def = REPORTS[type];
  if (!def) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (def.adminOnly && user.role !== "admin") return NextResponse.json({ error: "Only the owner can open this report" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const format = sp.get("format");
  if (!TYPES[format]) return NextResponse.json({ error: "format must be xlsx or pdf" }, { status: 400 });

  await connectDB();
  const range = reportRange(sp);
  const [report, shopName] = await Promise.all([def.build(range), getShopName()]);

  const file = format === "xlsx" ? await reportToExcel(report, shopName) : await reportToPdf(report, shopName, formatDateTime(new Date()));
  const name = `${report.filename}-${periodSlug(range)}.${format}`;
  return new Response(file, {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  });
}
