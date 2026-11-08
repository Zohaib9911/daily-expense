/** White card with a soft shadow. Optional title row with an action (button/link) on the right. */
export default function Card({ title, action, children, className = "", as: Tag = "section" }) {
  return (
    <Tag className={`min-w-0 rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
