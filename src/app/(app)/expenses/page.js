import Link from "next/link";
import mongoose from "mongoose";
import { Plus, Receipt } from "lucide-react";
import Card from "@/components/ui/Card";
import DateFilter from "@/components/ui/DateFilter";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import { requirePageUser } from "@/lib/auth-helpers";
import connectDB from "@/lib/db";
import { EXPENSE_CATEGORIES, METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { CATEGORY_META } from "@/lib/expense-meta";
import { resolveDateRange } from "@/lib/date-range";
import { WRITER_ROLES } from "@/lib/nav";
import { btnGhost, btnPrimary, inputClass } from "@/lib/ui";
import Expense from "@/models/Expense";
import User from "@/models/User";
import ExpenseCard from "./ExpenseCard";

export const metadata = { title: "Expenses" };

const PAGE_SIZE = 20;
const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function ExpensesPage({ searchParams }) {
  const user = await requirePageUser();
  const sp = await searchParams;

  const range = resolveDateRange(sp);
  const category = EXPENSE_CATEGORIES.includes(one(sp.category)) ? one(sp.category) : "";
  const method = PAYMENT_METHODS.includes(one(sp.method)) ? one(sp.method) : "";
  const createdBy = mongoose.isValidObjectId(one(sp.by)) ? one(sp.by) : "";
  const showVoided = one(sp.voided) === "1";
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const filter = { date: { $gte: range.start, $lt: range.end } };
  if (category) filter.category = category;
  if (method) filter.method = method;
  if (createdBy) filter.createdBy = createdBy;

  await connectDB();
  const opts = { showVoided }; // voided records are hidden unless asked for

  // Total = what was spent (approved only: voided, rejected and pending ones don't count). Mongoose casts find()
  // filters but not aggregate() ones, hence the explicit ObjectId.
  const aggMatch = { ...filter, status: { $in: ["approved", "pending_approval"] } }; // grouped by status below
  if (createdBy) aggMatch.createdBy = new mongoose.Types.ObjectId(createdBy);

  const [docs, count, totals, users] = await Promise.all([
    Expense.find(filter)
      .setOptions(opts)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate("createdBy", "name")
      .populate("staff supplier", "name")
      .populate({ path: "order", select: "orderNo customerName", options: { showVoided: true } })
      .lean(),
    Expense.countDocuments(filter).setOptions(opts),
    Expense.aggregate([{ $match: aggMatch }, { $group: { _id: "$status", total: { $sum: "$amount" }, n: { $sum: 1 } } }]),
    User.find().select("name").sort({ name: 1 }).lean(),
  ]);

  // Only APPROVED expenses count towards the total; pending ones are shown beside it until the owner approves them.
  const total = totals.find((t) => t._id === "approved")?.total || 0;
  const spentCount = totals.find((t) => t._id === "approved")?.n || 0;
  const pending = totals.find((t) => t._id === "pending_approval")?.total || 0;

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (p) => {
    const q = new URLSearchParams();
    const params = { range: range.range, from: range.range === "custom" ? range.from : "", to: range.range === "custom" ? range.to : "", category, method, by: createdBy, voided: showVoided ? "1" : "" };
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/expenses?${q.toString()}`;
  };
  const filtered = Boolean(category || method || createdBy || showVoided);
  const canAdd = WRITER_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <Card>
        <DateFilter />
      </Card>

      <Card>
        <p className="text-sm text-slate-500">Total spent</p>
        <p className="text-3xl">
          <MoneyText amount={total} type="out" />
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {spentCount} {spentCount === 1 ? "expense" : "expenses"}
          {pending > 0 && (
            <span className="text-amber-700">
              {" "}
              · <MoneyText amount={pending} className="!text-amber-700 !font-medium" /> waiting for approval (not counted)
            </span>
          )}
        </p>
      </Card>

      <details open={filtered} className="rounded-2xl bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-slate-700">
          More filters{filtered ? " (active)" : ""}
        </summary>
        <form method="get" className="space-y-3 px-4 pb-4">
          <input type="hidden" name="range" value={range.range} />
          {range.range === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <div>
            <label htmlFor="f-category" className="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
            <select id="f-category" name="category" defaultValue={category} className={inputClass}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-method" className="mb-1.5 block text-sm font-medium text-slate-700">Paid by</label>
            <select id="f-method" name="method" defaultValue={method} className={inputClass}>
              <option value="">Any method</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-by" className="mb-1.5 block text-sm font-medium text-slate-700">Entered by</label>
            <select id="f-by" name="by" defaultValue={createdBy} className={inputClass}>
              <option value="">Anyone</option>
              {users.map((u) => (
                <option key={String(u._id)} value={String(u._id)}>{u.name}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" name="voided" value="1" defaultChecked={showVoided} className="h-5 w-5 rounded border-slate-300" />
            Include voided expenses
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1`}>Apply</button>
            <Link href={`/expenses?range=${range.range}${range.range === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`} className={btnGhost}>
              Clear
            </Link>
          </div>
        </form>
      </details>

      {canAdd && (
        <Link href="/expenses/new" className={`${btnPrimary} min-h-12 w-full`}>
          <Plus size={20} />
          Add expense
        </Link>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses found"
          description={filtered ? "Try changing or clearing the filters." : "Nothing was spent in this period."}
        />
      ) : (
        <ul className="space-y-3">
          {docs.map((e) => (
            <ExpenseCard key={String(e._id)} e={e} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? <Link href={href(page - 1)} className={btnGhost}>Newer</Link> : <span />}
          <span className="text-sm text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className={btnGhost}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
