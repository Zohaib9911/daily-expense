import * as models from "@/models";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { sumBy } from "@/lib/reports/common";

const LABELS = Object.fromEntries(
  Object.values(models)
    .filter((m) => m?.modelName && m.collection)
    .map((m) => [m.collection.name, m.modelName])
);
const label = (c) => LABELS[c] || c;
const ATT = "attendances";
const SKIP = ["users"]; // user administration is not "entries"
const amountOf = (v) => v?.amount ?? v?.totalAmount ?? v?.netPaid ?? v?.netAmount ?? null;

// Partner activity, from the audit log: what each person created, edited, voided and backdated.
// Attendance marks are counted separately (they are entered every day and would drown everything else).
export async function buildActivityReport(r) {
  const match = { timestamp: { $gte: r.start, $lt: r.end }, collectionName: { $nin: SKIP } };
  const [logs, voids, backdated] = await Promise.all([
    AuditLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { user: "$user", userName: "$userName", collection: "$collectionName", action: "$action", backdated: { $and: [{ $eq: ["$action", "create"] }, { $eq: ["$newValue.isBackdated", true] }] } },
          n: { $sum: 1 },
        },
      },
    ]),
    AuditLog.find({ ...match, action: "void" }).sort({ timestamp: -1 }).limit(300).lean(),
    AuditLog.find({ ...match, action: "create", "newValue.isBackdated": true, collectionName: { $ne: ATT } }).sort({ timestamp: -1 }).limit(300).lean(),
  ]);

  const userIds = [...new Set(logs.map((l) => String(l._id.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select("name role").lean();
  const meta = new Map(users.map((u) => [String(u._id), u]));

  const per = new Map();
  const byType = new Map();
  for (const l of logs) {
    const id = String(l._id.user);
    const u = per.get(id) ?? { name: meta.get(id)?.name || l._id.userName || "Unknown", role: meta.get(id)?.role || "", created: 0, edited: 0, voided: 0, decided: 0, backdated: 0, attendance: 0 };
    const { action, collection, backdated: bd } = l._id;
    if (collection === ATT) {
      u.attendance += l.n;
    } else {
      if (action === "create") u.created += l.n;
      else if (action === "update") u.edited += l.n;
      else if (action === "void") u.voided += l.n;
      else if (action === "approve" || action === "reject") u.decided += l.n;
      if (bd) u.backdated += l.n;

      const t = byType.get(`${id}|${collection}`) ?? { user: u.name, type: label(collection), created: 0, edited: 0, voided: 0 };
      if (action === "create") t.created += l.n;
      else if (action === "update") t.edited += l.n;
      else if (action === "void") t.voided += l.n;
      byType.set(`${id}|${collection}`, t);
    }
    per.set(id, u);
  }
  const rows = [...per.values()].sort((a, b) => b.created + b.edited - (a.created + a.edited));
  const typeRows = [...byType.values()].sort((a, b) => a.user.localeCompare(b.user) || b.created + b.edited - (a.created + a.edited));

  const voidRows = voids.filter((v) => v.collectionName !== ATT).map((v) => ({ at: v.timestamp, by: v.userName || "", type: label(v.collectionName), amount: amountOf(v.newValue ?? v.oldValue), reason: v.newValue?.voidReason || "" }));
  const bdRows = backdated.map((b) => ({ at: b.timestamp, by: b.userName || "", type: label(b.collectionName), entryDate: b.newValue?.date || b.newValue?.orderDate || null, amount: amountOf(b.newValue) }));

  return {
    key: "activity",
    title: "Partner activity",
    filename: "partner-activity-report",
    range: r,
    summary: [
      { label: "Entries created", value: sumBy(rows, "created"), kind: "int" },
      { label: "Edits", value: sumBy(rows, "edited"), kind: "int" },
      { label: "Voids", value: sumBy(rows, "voided"), kind: "int", tone: sumBy(rows, "voided") > 0 ? "out" : "neutral" },
      { label: "Backdated entries", value: sumBy(rows, "backdated"), kind: "int", tone: sumBy(rows, "backdated") > 0 ? "out" : "neutral" },
    ],
    tables: [
      {
        id: "users",
        title: "By person",
        note: "From the audit log. Backdated = created with a date before the day it was entered. Attendance marks are counted separately.",
        columns: [
          { key: "name", label: "Person", type: "text", w: 3 },
          { key: "role", label: "Role", type: "text" },
          { key: "created", label: "Created", type: "int" },
          { key: "edited", label: "Edited", type: "int" },
          { key: "voided", label: "Voided", type: "int", tone: "out" },
          { key: "decided", label: "Approved/rejected", type: "int" },
          { key: "backdated", label: "Backdated", type: "int", tone: "out" },
          { key: "attendance", label: "Attendance marks", type: "int" },
        ],
        rows,
        totals: { name: "Total", created: sumBy(rows, "created"), edited: sumBy(rows, "edited"), voided: sumBy(rows, "voided"), decided: sumBy(rows, "decided"), backdated: sumBy(rows, "backdated"), attendance: sumBy(rows, "attendance") },
      },
      {
        id: "types",
        title: "By person and record type",
        columns: [
          { key: "user", label: "Person", type: "text", w: 3 },
          { key: "type", label: "Record type", type: "text", w: 3 },
          { key: "created", label: "Created", type: "int" },
          { key: "edited", label: "Edited", type: "int" },
          { key: "voided", label: "Voided", type: "int", tone: "out" },
        ],
        rows: typeRows,
      },
      {
        id: "voids",
        title: "Voided records",
        note: voids.length >= 300 ? "Showing the latest 300." : undefined,
        columns: [
          { key: "at", label: "When", type: "datetime" },
          { key: "by", label: "Voided by", type: "text", w: 2 },
          { key: "type", label: "Record type", type: "text", w: 2 },
          { key: "amount", label: "Amount", type: "money" },
          { key: "reason", label: "Reason", type: "text", w: 5 },
        ],
        rows: voidRows,
      },
      {
        id: "backdated",
        title: "Backdated entries",
        note: backdated.length >= 300 ? "Showing the latest 300." : "Entries whose date is earlier than the day they were entered.",
        columns: [
          { key: "at", label: "Entered", type: "datetime" },
          { key: "by", label: "Entered by", type: "text", w: 2 },
          { key: "type", label: "Record type", type: "text", w: 2 },
          { key: "entryDate", label: "Dated", type: "date" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows: bdRows,
      },
    ],
  };
}
