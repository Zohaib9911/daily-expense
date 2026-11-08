// Shared Tailwind class strings. Lives outside "use client" files so server components can use it.
export const inputClass =
  "w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

export const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60";
export const btnPrimary = `${btn} bg-emerald-600 text-white hover:bg-emerald-700`;
export const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
