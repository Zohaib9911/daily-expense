// Loading placeholders shown by the route-level loading.js files while a page's data is fetched.
// Server component (no state). Shapes roughly match the real pages so the layout doesn't jump.

const bar = "animate-pulse rounded-lg bg-slate-200";

function Card({ children, className = "" }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

function ListCard() {
  return (
    <Card className="flex items-center gap-3">
      <div className={`${bar} h-11 w-11 shrink-0 rounded-full`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`${bar} h-4 w-2/3`} />
        <div className={`${bar} h-3 w-1/3`} />
      </div>
      <div className={`${bar} h-5 w-20`} />
    </Card>
  );
}

function Field() {
  return (
    <div className="space-y-2">
      <div className={`${bar} h-3 w-24`} />
      <div className={`${bar} h-12 w-full rounded-xl`} />
    </div>
  );
}

/**
 * variant: "dashboard" (stat cards + blocks) | "list" (filter row + cards) | "detail" (summary + sections)
 *          | "form" (fields + big button)
 */
export default function PageSkeleton({ variant = "list" }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading...</span>

      {variant === "dashboard" && (
        <>
          <div className={`${bar} h-11 w-full rounded-xl`} />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="space-y-3">
                <div className={`${bar} h-3 w-1/2`} />
                <div className={`${bar} h-7 w-3/4`} />
              </Card>
            ))}
          </div>
          <Card className="space-y-3">
            <div className={`${bar} h-4 w-1/3`} />
            <div className={`${bar} h-40 w-full`} />
          </Card>
          <Card className="space-y-3">
            <div className={`${bar} h-4 w-1/3`} />
            <div className={`${bar} h-24 w-full`} />
          </Card>
        </>
      )}

      {variant === "list" && (
        <>
          <div className={`${bar} h-11 w-full rounded-xl`} />
          <Card className="space-y-2">
            <div className={`${bar} h-3 w-1/3`} />
            <div className={`${bar} h-7 w-1/2`} />
          </Card>
          {[0, 1, 2, 3, 4].map((i) => (
            <ListCard key={i} />
          ))}
        </>
      )}

      {variant === "detail" && (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`${bar} h-12 w-12 rounded-full`} />
              <div className="flex-1 space-y-2">
                <div className={`${bar} h-4 w-1/2`} />
                <div className={`${bar} h-3 w-1/3`} />
              </div>
            </div>
            <div className={`${bar} h-9 w-2/3`} />
          </Card>
          <Card className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between gap-6">
                <div className={`${bar} h-4 w-1/4`} />
                <div className={`${bar} h-4 w-1/3`} />
              </div>
            ))}
          </Card>
          <Card className="space-y-3">
            <div className={`${bar} h-4 w-1/4`} />
            <div className={`${bar} h-20 w-full`} />
          </Card>
        </>
      )}

      {variant === "form" && (
        <>
          <Card className="space-y-4">
            <Field />
            <Field />
            <Field />
            <Field />
          </Card>
          <div className={`${bar} h-14 w-full rounded-xl`} />
        </>
      )}
    </div>
  );
}
