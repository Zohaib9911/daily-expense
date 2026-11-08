import Link from "next/link";
import connectDB from "@/lib/db";
import * as models from "@/models";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { requirePageRole } from "@/lib/auth-helpers";
import { dayRange } from "@/lib/dates";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import AuditLogCard from "./AuditLogCard";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 25;
const ACTIONS = ["create", "update", "void", "approve", "reject", "export"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// collection name in MongoDB (e.g. "orders") -> model name (e.g. "Order")
const COLLECTIONS = Object.fromEntries(
  Object.values(models)
    .filter((m) => m?.modelName && m.modelName !== "AuditLog" && m.modelName !== "Counter")
    .map((m) => [m.collection.name, m.modelName])
);
COLLECTIONS.backup = "Backup download"; // not a model: full-backup exports are logged under this name

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AuditLogPage({ searchParams }) {
  await requirePageRole(["admin"]);
  const sp = await searchParams;

  const from = DATE_RE.test(one(sp.from)) ? one(sp.from) : "";
  const to = DATE_RE.test(one(sp.to)) ? one(sp.to) : "";
  const userId = /^[a-f\d]{24}$/i.test(one(sp.user)) ? one(sp.user) : "";
  const collection = COLLECTIONS[one(sp.collection)] ? one(sp.collection) : "";
  const action = ACTIONS.includes(one(sp.action)) ? one(sp.action) : "";
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const filter = {};
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = dayRange(from).start; // Karachi day boundaries
    if (to) filter.timestamp.$lt = dayRange(to).end;
  }
  if (userId) filter.user = userId;
  if (collection) filter.collectionName = collection;
  if (action) filter.action = action;

  await connectDB();
  const [total, docs, users] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    User.find().select("name username").sort({ name: 1 }).lean(),
  ]);

  const logs = docs.map((d) => ({
    id: String(d._id),
    collectionName: d.collectionName,
    recordId: String(d.recordId),
    action: d.action,
    oldValue: d.oldValue ?? null,
    newValue: d.newValue ?? null,
    userName: d.userName || "",
    ip: d.ip || "",
    timestamp: d.timestamp.toISOString(),
  }));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ from, to, user: userId, collection, action })) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/audit-log?${s}` : "/audit-log";
  };
  const filtered = Boolean(from || to || userId || collection || action);

  return (
    <div className="space-y-4">
      <details open={filtered} className="rounded-2xl bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-slate-700">
          Filters{filtered ? " (active)" : ""}
        </summary>
        <form method="get" className="space-y-3 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-slate-700">From</label>
              <input id="from" name="from" type="date" defaultValue={from} className={inputClass} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-slate-700">To</label>
              <input id="to" name="to" type="date" defaultValue={to} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="user" className="mb-1.5 block text-sm font-medium text-slate-700">User</label>
            <select id="user" name="user" defaultValue={userId} className={inputClass}>
              <option value="">All users</option>
              {users.map((u) => (
                <option key={String(u._id)} value={String(u._id)}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="collection" className="mb-1.5 block text-sm font-medium text-slate-700">Collection</label>
            <select id="collection" name="collection" defaultValue={collection} className={inputClass}>
              <option value="">All collections</option>
              {Object.entries(COLLECTIONS).map(([name, label]) => (
                <option key={name} value={name}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="action" className="mb-1.5 block text-sm font-medium text-slate-700">Action</label>
            <select id="action" name="action" defaultValue={action} className={`${inputClass} capitalize`}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1`}>Apply</button>
            <Link href="/audit-log" className={btnGhost}>Clear</Link>
          </div>
        </form>
      </details>

      <p className="text-sm text-slate-500">
        {total} {total === 1 ? "entry" : "entries"}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      {logs.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No audit entries match these filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <AuditLogCard
              key={log.id}
              log={log}
              collectionLabel={COLLECTIONS[log.collectionName] || log.collectionName}
            />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? <Link href={href(page - 1)} className={btnGhost}>Newer</Link> : <span />}
          {page < pages ? <Link href={href(page + 1)} className={btnGhost}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
