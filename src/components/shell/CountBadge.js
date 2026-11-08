/** Small red count bubble (pending approvals). Renders nothing for 0. Position it with `className`. */
export default function CountBadge({ count, className = "" }) {
  if (!count || count < 1) return null;
  return (
    <span
      aria-label={`${count} waiting for approval`}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
