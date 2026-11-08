import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatValue, toneOf } from "@/lib/reports/format";

const h = React.createElement;
const PDF_ROW_LIMIT = 2000;
const RIGHT = new Set(["money", "int", "pct"]);
const COLOR = { in: "#15803d", out: "#b91c1c", neutral: "#0f172a" };

// The built-in PDF font only has Latin letters: anything else (for example Urdu script) can't be drawn,
// so it is replaced with "?". Excel exports keep the original text.
const latin = (s) => String(s).replace(/[^ -~ -ÿ–—‘’“”•…]/g, "?");

const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  shop: { fontSize: 11, color: "#475569" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  meta: { fontSize: 9, color: "#64748b", marginTop: 2 },
  summary: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, marginBottom: 4 },
  box: { width: "24%", marginRight: "1%", marginBottom: 6, padding: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4 },
  boxLabel: { fontSize: 8, color: "#64748b" },
  boxValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tableTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 2 },
  note: { fontSize: 8, color: "#64748b", marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#1e3a8a", paddingVertical: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#334155", backgroundColor: "#f1f5f9", paddingVertical: 4 },
  headCell: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8, paddingHorizontal: 4 },
  cell: { paddingHorizontal: 4 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 8, color: "#94a3b8", flexDirection: "row", justifyContent: "space-between" },
});

const flexOf = (c) => c.w || (RIGHT.has(c.type) ? 1.3 : c.type === "text" ? 2 : 1.5);

function Table({ t }) {
  const rows = t.rows.slice(0, PDF_ROW_LIMIT);
  return h(
    View,
    null,
    h(Text, { style: styles.tableTitle, minPresenceAhead: 70 }, latin(t.title)), // keep the heading with its first rows
    t.note ? h(Text, { style: styles.note }, latin(t.note)) : null,
    h(
      View,
      { style: styles.headRow, wrap: false },
      ...t.columns.map((c) => h(Text, { key: c.key, style: [styles.headCell, { flex: flexOf(c), textAlign: RIGHT.has(c.type) ? "right" : "left" }] }, latin(c.label)))
    ),
    rows.length === 0 ? h(Text, { style: { fontSize: 9, color: "#64748b", paddingVertical: 6 } }, "Nothing in this period.") : null,
    ...rows.map((r, i) =>
      h(
        View,
        { key: i, style: styles.row, wrap: false },
        ...t.columns.map((c) => {
          const v = r[c.key];
          const tone = c.type === "money" ? COLOR[toneOf(c.tone, v)] : COLOR.neutral;
          return h(Text, { key: c.key, style: [styles.cell, { flex: flexOf(c), textAlign: RIGHT.has(c.type) ? "right" : "left", color: tone }] }, latin(formatValue(v, c.type)));
        })
      )
    ),
    t.rows.length > PDF_ROW_LIMIT ? h(Text, { style: styles.note }, `Showing the first ${PDF_ROW_LIMIT} of ${t.rows.length} rows. Export to Excel for all rows.`) : null,
    t.totals
      ? h(
          View,
          { style: styles.totalRow, wrap: false },
          ...t.columns.map((c) => {
            const v = t.totals[c.key];
            const tone = c.type === "money" && v !== undefined ? COLOR[toneOf(c.tone, v)] : COLOR.neutral;
            return h(Text, { key: c.key, style: [styles.cell, { flex: flexOf(c), textAlign: RIGHT.has(c.type) ? "right" : "left", fontFamily: "Helvetica-Bold", color: tone }] }, latin(formatValue(v, c.type)));
          })
        )
      : null
  );
}

/** Builds the PDF for a report (A4 landscape). Returns a Buffer. */
export async function reportToPdf(report, shopName, generatedLabel) {
  const doc = h(
    Document,
    { title: `${report.title} - ${report.range.label}`, author: shopName },
    h(
      Page,
      { size: "A4", orientation: "landscape", style: styles.page },
      h(Text, { style: styles.shop }, latin(shopName)),
      h(Text, { style: styles.title }, latin(report.title)),
      h(Text, { style: styles.meta }, latin(`Period: ${report.range.label}    Generated: ${generatedLabel}`)),
      h(
        View,
        { style: styles.summary },
        ...report.summary.map((s) => {
          const tone = COLOR[toneOf(s.tone, s.value)];
          return h(View, { key: s.label, style: styles.box, wrap: false }, h(Text, { style: styles.boxLabel }, latin(s.label)), h(Text, { style: [styles.boxValue, { color: tone }] }, latin(formatValue(s.value, s.kind) || "-")));
        })
      ),
      ...report.tables.map((t) => h(Table, { key: t.id, t })),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, null, latin(`${shopName} - ${report.title}`)),
        h(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` })
      )
    )
  );
  return renderToBuffer(doc);
}
