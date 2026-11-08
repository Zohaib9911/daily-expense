import ExcelJS from "exceljs";
import { isDateLike } from "@/lib/reports/format";

// Karachi is UTC+5 all year. Excel has no time zones, so dates are written as the Karachi wall-clock time
// (otherwise a 10:00 am entry would show as 5:00 am).
const asWall = (d) => new Date(new Date(d).getTime() + 5 * 60 * 60 * 1000);

const FORMAT = {
  money: '"Rs "#,##0;[Red]-"Rs "#,##0',
  int: "#,##0",
  pct: "0%",
  date: "dd mmm yyyy",
  datetime: "dd mmm yyyy hh:mm",
};
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };

function excelValue(value, type) {
  if (value === null || value === undefined || value === "") return null;
  if (type === "date" || type === "datetime") return isDateLike(value) ? asWall(value) : value; // a label such as "Total" stays text
  return value;
}

const sheetName = (title, used) => {
  let base = title.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

/** Builds the .xlsx for a report (see src/lib/reports/common.js for the shape). Returns a Buffer. */
export async function reportToExcel(report, shopName) {
  const wb = new ExcelJS.Workbook();
  wb.creator = shopName;
  wb.created = new Date();
  const used = new Set(["summary"]);

  // --- Summary sheet
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 36 }, { width: 26 }];
  ws.addRow([shopName]).font = { bold: true, size: 14 };
  ws.addRow([report.title]).font = { bold: true, size: 12 };
  ws.addRow(["Period", report.range.label]);
  ws.addRow(["Generated", asWall(new Date())]).getCell(2).numFmt = FORMAT.datetime;
  ws.addRow([]);
  for (const s of report.summary) {
    const row = ws.addRow([s.label, excelValue(s.value, s.kind) ?? "—"]);
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "right" };
    if (FORMAT[s.kind]) row.getCell(2).numFmt = FORMAT[s.kind];
  }

  // --- One sheet per table
  for (const t of report.tables) {
    const sh = wb.addWorksheet(sheetName(t.title, used));
    sh.addRow([t.title]).font = { bold: true, size: 12 };
    const note = sh.addRow([t.note || ""]);
    note.font = { italic: true, color: { argb: "FF64748B" } };

    const headerRow = sh.addRow(t.columns.map((c) => c.label));
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell((cell, i) => {
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: ["money", "int", "pct"].includes(t.columns[i - 1].type) ? "right" : "left", vertical: "middle", wrapText: true };
    });

    for (const r of t.rows) {
      const row = sh.addRow(t.columns.map((c) => excelValue(r[c.key], c.type)));
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        const c = t.columns[i - 1];
        if (c && FORMAT[c.type]) cell.numFmt = FORMAT[c.type];
      });
    }
    if (t.totals) {
      const row = sh.addRow(t.columns.map((c) => excelValue(t.totals[c.key], c.type)));
      row.font = { bold: true };
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        const c = t.columns[i - 1];
        if (c && FORMAT[c.type]) cell.numFmt = FORMAT[c.type];
        cell.border = { top: { style: "thin" } };
      });
    }

    // column widths from the content
    t.columns.forEach((c, i) => {
      const longest = Math.max(c.label.length, ...t.rows.slice(0, 200).map((r) => String(r[c.key] instanceof Date ? "dd mmm yyyy hh:mm" : r[c.key] ?? "").length));
      sh.getColumn(i + 1).width = Math.min(Math.max(longest + 3, c.type === "money" ? 16 : 11), 60);
    });
    sh.views = [{ state: "frozen", ySplit: 3 }]; // title, note and header stay visible
    if (t.rows.length) sh.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: t.columns.length } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
