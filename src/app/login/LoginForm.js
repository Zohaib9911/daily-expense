"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import PasswordInput, { inputClass } from "@/components/PasswordInput";
import { AUTH_ERRORS } from "@/lib/auth-messages";

// Only allow same-site relative redirects.
function safeCallback(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const res = await signIn("credentials", {
        username: data.get("username"),
        password: data.get("password"),
        redirect: false,
      });
      if (res?.error) {
        setError(AUTH_ERRORS[res.error] || "Could not sign in. Please try again.");
        setBusy(false);
        return;
      }
      router.replace(safeCallback(params.get("callbackUrl")));
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    // method="post": if the form is ever submitted natively (before the page's JavaScript has
    // loaded), the credentials must never end up in the URL.
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy && <Loader2 size={18} className="animate-spin" />}
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
