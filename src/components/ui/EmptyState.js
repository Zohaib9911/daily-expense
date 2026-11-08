import { Inbox } from "lucide-react";

/** Friendly "nothing here" block. `action` is any node (e.g. a link styled with btnPrimary). */
export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 text-center shadow-sm">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={28} />
      </span>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
