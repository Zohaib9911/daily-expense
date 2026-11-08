/** "0300-1234567" / "+92 300 1234567" -> "923001234567" for wa.me links. Returns "" if unusable. */
export function waNumber(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0092")) d = d.slice(2);
  else if (d.startsWith("0")) d = `92${d.slice(1)}`;
  return d.length >= 10 && d.length <= 15 ? d : "";
}
