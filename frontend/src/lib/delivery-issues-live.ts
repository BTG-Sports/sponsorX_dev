/* --------------------------------------------------------------------------
   2S4-FE-04 (BTG half) — the Delivery issues desk (Claude Design
   DeliveryIssues.dc.html, views problems / detail / confirm / refund /
   overdue).

   The rule it serves (programme owner, 2026-10-01): when a seller marks a
   line delivered, the sponsor has 24 hours to confirm it or report a
   problem. If they don't answer, the line counts as confirmed. It closes by
   itself 30 days after confirmation. BTG only sees the exceptions: a
   problem the sponsor reported, or a seller late marking delivery.

   LIVE since 2S4-BE-07 / 2S4-BE-08 (BTG admin only — orderDelivery approve):
     GET  /delivery-issues                 { problems, overdue }
     GET  /delivery-issues/:lineId         one, with the money on hold and its history
     POST /delivery-issues/:lineId/resolve { decision: CONFIRM | REFUND, note }
     POST /delivery-issues/:lineId/remind  a late seller, at most once a day
     GET  /deliveries/:lineId/proof        the seller's photo, a 5-minute audited link

   Pure: shapes, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

export const CONFIRM_WINDOW_HOURS = 24;

export type Party = { name: string; sub: string | null };

/** One line on the desk — a reported problem, or an overdue line (GET /delivery-issues). */
export type ApiDeliveryIssue = {
  /** The order line's id. */
  id: string;
  orderId: string;
  orderRef: string;
  state: "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED" | "UNPAID";
  line: string;
  /** "2 sessions" */
  quantity: string;
  unitPriceCents: number;
  dates: string[];
  lastDate: string;
  seller: Party;
  sponsor: Party;
  sponsorMessage: { text: string; at: string } | null;
  sellerNote: { text: string; at: string; proofCount: number; link: string | null } | null;
  hold: { sellerShareCents: number; teamShareCents: number; sponsorPaidCents: number };
  remindedAt: string | null;
  history: { at: string; text: string }[];
};

export type ApiDeliveryDesk = { confirmWindowHours: number; problems: ApiDeliveryIssue[]; overdue: ApiDeliveryIssue[] };

/* ------------------------------------------------------------------ tabs */

export const DELIVERY_TABS = [
  { key: "problems", label: "Problems reported" },
  { key: "overdue", label: "Overdue" },
] as const;
export type DeliveryTab = (typeof DELIVERY_TABS)[number];

export function deliveryTab(raw: string | string[] | undefined): DeliveryTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return DELIVERY_TABS.find((t) => t.key === v) ?? DELIVERY_TABS[0];
}

/* ---------------------------------------------------------------- words */

/** "$1,000.00" */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "Oct 17" — a calendar date (YYYY-MM-DD) or an instant. */
export function dayOf(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 17, 7:40 PM" (UTC) */
export function momentOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** "2 sessions × $500.00 · Oct 10 and Oct 17 · seller … · sponsor …" */
export function lineSummary(p: Pick<ApiDeliveryIssue, "quantity" | "unitPriceCents" | "dates" | "seller" | "sponsor">): string {
  const dates = p.dates.map(dayOf);
  const when = dates.length > 1 ? `${dates.slice(0, -1).join(", ")} and ${dates[dates.length - 1]}` : dates[0] ?? "";
  const who = (x: Party) => (x.sub ? `${x.name} (${x.sub})` : x.name);
  return `${p.quantity} × ${money(p.unitPriceCents)} · ${when} · seller ${who(p.seller)} · sponsor ${who(p.sponsor)}`;
}

/** "Riley Carter’s", "Westfield Hawks’" */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export function proofWords(n: number, link?: string | null): string {
  if (n === 0) return link ? "A link was added" : "No proof attached";
  return `${n} photo${n === 1 ? "" : "s"} attached${link ? " and a link" : ""}`;
}

export function overdueBadge(o: Pick<ApiDeliveryIssue, "remindedAt">): { label: string; tone: "warn" | "primary" } {
  return o.remindedAt ? { label: `Reminder sent ${dayOf(o.remindedAt)}`, tone: "primary" } : { label: "Not marked delivered", tone: "warn" };
}

/** The 24-hour rule, in the words the desk uses. */
export const CONFIRM_RULE =
  `When a seller marks a line delivered, the sponsor has ${CONFIRM_WINDOW_HOURS} hours to confirm it or report a problem. If they don’t answer, it counts as confirmed.`;

/** BTG's words for a refused write, from the API's error body. */
export function deskRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a BTG admin can decide delivery problems.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
