const STYLES = {
  // orders
  pending: "bg-amber-50 text-amber-700",
  in_production: "bg-blue-50 text-blue-700",
  ready: "bg-indigo-50 text-indigo-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-600",
  // expenses / approvals
  approved: "bg-green-50 text-green-700",
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  // flags
  voided: "bg-red-50 text-red-700",
  backdated: "bg-orange-50 text-orange-700",
  locked: "bg-slate-100 text-slate-700",
  active: "bg-green-50 text-green-700",
  inactive: "bg-red-50 text-red-700",
};

const humanize = (s) => String(s).replace(/_/g, " ");

/** <StatusBadge status="pending_approval" /> -> amber "pending approval". Pass `label` to override text. */
export default function StatusBadge({ status, label, className = "" }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        STYLES[status] ?? "bg-slate-100 text-slate-700"
      } ${className}`}
    >
      {label ?? humanize(status)}
    </span>
  );
}
