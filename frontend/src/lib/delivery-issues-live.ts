/* --------------------------------------------------------------------------
   2S4-FE-04 (BTG half) — the Delivery issues desk (Claude Design
   DeliveryIssues.dc.html, views problems / detail / confirm / refund /
   overdue).

   The rule it serves (programme owner, 2026-10-01): when a seller marks a
   line delivered, the sponsor has 24 hours to confirm it or report a
   problem. If they don't answer, the line counts as confirmed. It closes by
   itself 30 days after confirmation. BTG only sees the exceptions: a
   problem the sponsor reported, or a seller late marking delivery.

   SCAFFOLD — delivery confirmation is 2S4-BE-07, not built yet. The
   fixtures below are typed like the API it will add; every money figure is
   a labelled sample.

   Pure: shapes, fixtures, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

export const DELIVERY_BACKEND = "2S4-BE-07 (delivery confirmation)";
export const CONFIRM_WINDOW_HOURS = 24;

export type Party = { name: string; sub: string | null };

export type DeliveryProblem = {
  id: string;
  orderRef: string;
  line: string;
  quantity: string;
  unitPriceCents: number;
  dates: string[];
  seller: Party;
  sponsor: Party;
  state: "PROBLEM_REPORTED";
  sponsorMessage: { text: string; at: string };
  sellerNote: { text: string; at: string; proofCount: number };
  hold: { sellerShareCents: number; teamShareCents: number; sponsorPaidCents: number };
  history: { at: string; text: string }[];
};

export type OverdueLine = {
  id: string;
  orderRef: string;
  line: string;
  seller: Party;
  sponsor: Party;
  lastDate: string;
  remindedAt: string | null;
};

/* -------------------------------------------------------------- fixtures */

export const SAMPLE_PROBLEMS: readonly DeliveryProblem[] = [
  {
    id: "SX-BAY6NFY3",
    orderRef: "SX-BAY6NFY3",
    line: "Youth basketball clinic with Riley Carter",
    quantity: "2 sessions",
    unitPriceCents: 50_000,
    dates: ["2026-10-10", "2026-10-17"],
    seller: { name: "Riley Carter", sub: "Westfield Hawks" },
    sponsor: { name: "Harbor Coffee", sub: "Dana Brooks" },
    state: "PROBLEM_REPORTED",
    sponsorMessage: { text: "We only saw one clinic. The Oct 17 session didn’t happen.", at: "2026-10-18T09:12:00Z" },
    sellerNote: { text: "Both clinics held, Oct 10 and 17, 18 kids each", at: "2026-10-17T19:40:00Z", proofCount: 1 },
    hold: { sellerShareCents: 60_424, teamShareCents: 15_105, sponsorPaidCents: 100_000 },
    history: [
      { at: "2026-10-01T12:00:00Z", text: "Paid · confirmed by the payment provider" },
      { at: "2026-10-17T19:40:00Z", text: "Marked delivered by Riley Carter" },
      { at: "2026-10-18T09:12:00Z", text: "Problem reported by Dana Brooks · payout put on hold" },
    ],
  },
];

export const SAMPLE_OVERDUE: readonly OverdueLine[] = [
  {
    id: "SX-BAY6NFY3-overdue",
    orderRef: "SX-BAY6NFY3",
    line: "Youth basketball clinic with Riley Carter · 2 sessions",
    seller: { name: "Riley Carter", sub: "Westfield Hawks" },
    sponsor: { name: "Harbor Coffee", sub: null },
    lastDate: "2026-10-17",
    remindedAt: null,
  },
];

export function sampleProblem(id: string): DeliveryProblem | null {
  return SAMPLE_PROBLEMS.find((p) => p.id === id) ?? null;
}

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
export function lineSummary(p: DeliveryProblem): string {
  const dates = p.dates.map(dayOf);
  const when = dates.length > 1 ? `${dates.slice(0, -1).join(", ")} and ${dates[dates.length - 1]}` : dates[0] ?? "";
  const who = (x: Party) => (x.sub ? `${x.name} (${x.sub})` : x.name);
  return `${p.quantity} × ${money(p.unitPriceCents)} · ${when} · seller ${who(p.seller)} · sponsor ${who(p.sponsor)}`;
}

/** "Riley Carter’s", "Westfield Hawks’" */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export function proofWords(n: number): string {
  return n === 0 ? "No proof attached" : `${n} photo${n === 1 ? "" : "s"} attached`;
}

export function overdueBadge(o: OverdueLine): { label: string; tone: "warn" | "primary" } {
  return o.remindedAt ? { label: `Reminder sent ${dayOf(o.remindedAt)}`, tone: "primary" } : { label: "Not marked delivered", tone: "warn" };
}

/** The 24-hour rule, in the words the desk uses. */
export const CONFIRM_RULE =
  `When a seller marks a line delivered, the sponsor has ${CONFIRM_WINDOW_HOURS} hours to confirm it or report a problem. If they don’t answer, it counts as confirmed.`;
