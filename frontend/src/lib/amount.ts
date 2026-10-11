/* --------------------------------------------------------------------------
   Amount parsing — shared by the marketplace catalog (a client island) and
   the marketplace page (a server component). Living in its own plain module
   means a server component can call it directly instead of importing from a
   "use client" file, which fails at runtime ("Attempted to call parseAmount()
   from the server").
   -------------------------------------------------------------------------- */

/** Parse a display amount to a sortable number: "$1,500–$3,000" → 1500,
    "~$2,500" → 2500, "1.2M" → 1200000, "$15K–$30K+" → 15000. Non-numeric
    ("Recurring") → 0, so it sorts to the bottom of a low→high order. */
export function parseAmount(s: string): number {
  const m = s.replace(/[,$~\s]/g, "").match(/([\d.]+)\s*([KM])?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const suf = m[2]?.toUpperCase();
  if (suf === "K") n *= 1e3;
  else if (suf === "M") n *= 1e6;
  return n;
}
