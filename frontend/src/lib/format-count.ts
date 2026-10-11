/* The one figure formatter (P1-ART-22/23). A plain module — not the client
   island arena-fx.tsx — so server components can call it too: a function
   exported from a "use client" file is only a client reference on the
   server, and calling it there throws. arena-fx re-exports both names.
   Money is given in cents (the API's unit everywhere). */

export type CountFormat = "int" | "usd" | "usd0" | "pct";

/** cents → "$1,234.56"; "usd0" cents → "$1,234" (rounded, no decimals);
 *  integers → "1,234"; pct → "73%". */
export function formatCount(value: number, format: CountFormat): string {
  if (format === "usd") return `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "usd0") return `$${Math.round(value / 100).toLocaleString("en-US")}`;
  if (format === "pct") return `${Math.round(value)}%`;
  return Math.round(value).toLocaleString("en-US");
}
