import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import LoginForm from "./LoginForm";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getShopName } from "@/lib/shop";

export const metadata = { title: "Sign in" };

function Card({ shopName, children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <Store size={28} />
          </div>
          <h1 className="min-h-8 text-2xl font-bold text-slate-900">{shopName}</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-md shadow-slate-200/70">{children}</div>
      </div>
    </main>
  );
}

// Reads the session and DB, so it streams in behind the Suspense boundary (Cache Components).
async function LoginContent() {
  if (await getCurrentUser()) redirect("/");
  const shopName = await getShopName();
  return (
    <Card shopName={shopName}>
      <LoginForm />
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Card shopName="" />}>
      <LoginContent />
    </Suspense>
  );
}
