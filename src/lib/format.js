/** 12500 -> "Rs 12,500". Whole rupees only; negatives as "-Rs 1,000". */
export function formatPKR(amount) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return "Rs 0";
  const digits = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `-Rs ${digits}` : `Rs ${digits}`;
}
