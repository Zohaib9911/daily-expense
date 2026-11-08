import { Suspense } from "react";
import Sidebar from "@/components/shell/Sidebar";
import TopBar from "@/components/shell/TopBar";
import BottomNav from "@/components/shell/BottomNav";
import { ToastProvider } from "@/components/ui/Toast";
import { requirePageUser } from "@/lib/auth-helpers";
import { getShopName } from "@/lib/shop";
import { pendingApprovalCount } from "@/lib/approvals";

// The whole signed-in app is request-time data (session + DB), so one Suspense
// boundary wraps it. With Cache Components, reading the session outside a
// boundary is a build error.
async function Shell({ children }) {
  const user = await requirePageUser();
  const shopName = await getShopName();
  // Red badge: expenses waiting for the owner. Only the owner sees it (and only the owner can act on it).
  const pendingCount = user.role === "admin" ? await pendingApprovalCount() : 0;

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-slate-50">
        <Sidebar role={user.role} shopName={shopName} pendingCount={pendingCount} />
        <TopBar name={user.name} role={user.role} />
        {/* top padding = top bar (3.5rem) + notch; bottom = bottom nav (4rem) + home indicator */}
        <main className="min-w-0 print:!p-0 pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(4.5rem+env(safe-area-inset-top))] md:pb-8 md:pl-[17rem] md:pr-6">
          <div className="mx-auto min-w-0 max-w-5xl">{children}</div>
        </main>
        <BottomNav role={user.role} pendingCount={pendingCount} />
      </div>
    </ToastProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="fixed inset-x-0 top-0 h-14 border-b border-slate-200 bg-white md:left-60" />
    </div>
  );
}

export default function AppLayout({ children }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
