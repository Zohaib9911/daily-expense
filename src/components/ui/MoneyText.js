import { formatPKR } from "@/lib/format";

const TONE = {
  in: "text-green-600", // money coming in
  out: "text-red-600", // money going out
  neutral: "text-slate-900",
};

/**
 * <MoneyText amount={12500} type="in" />  -> green "Rs 12,500"
 * <MoneyText amount={500} type="out" sign /> -> red "-Rs 500" (sign adds +/- by type)
 */
export default function MoneyText({ amount, type = "neutral", sign = false, className = "" }) {
  const n = Math.round(Number(amount) || 0);
  const text = sign && type !== "neutral" ? `${type === "in" ? "+" : "-"}${formatPKR(Math.abs(n))}` : formatPKR(n);
  return <span className={`whitespace-nowrap font-semibold tabular-nums ${TONE[type] ?? TONE.neutral} ${className}`}>{text}</span>;
}
