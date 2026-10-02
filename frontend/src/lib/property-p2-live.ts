/* --------------------------------------------------------------------------
   The property manager's Phase 2 screens — the pure pieces.

     2S2-FE-04  Roster        GET /team/athletes, POST /team/roster,
                              PATCH /team/roster/:athleteId
     2S3-FE-01  Listings      GET /listings, GET /listings/:id, POST /listings,
                              PATCH /listings/:id, POST …/submit, …/transition,
                              GET /team/inventory, GET /inventory/:id
     2S5-FE-02  Earnings      GET /team/ledger (+ /team/analytics byMonth)
     2S7-FE-01  Analytics     GET /team/analytics
     2S7-FE-03  Branding      GET/PUT /branding, POST /branding/logo

   Every figure a screen shows comes through one of these from a named API
   field. Money on the wire is integer cents. What the API does not give is
   not shown: no per-athlete revenue, no payout history (the PAYOUT entry is
   never written yet), no CPM (the API says why, and that is what we show).
   -------------------------------------------------------------------------- */

import type { ListingHold } from "@/lib/listing-outcome";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";

/* ================================================================ shared */

/** Integer cents → "$1,234.56". */
export function usdCents(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "SOCIAL_POST" → "Social post". */
export function enumLabel(v: string): string {
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2026-09" → "Sep 2026". */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** ISO → "Oct 1, 2026". */
export function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** A rate 0..1 → "42%"; null → "—" (the API has nothing to divide by). */
export function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 1000) / 10}%`;
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    issues?: Array<{ path?: Array<string | number>; message: string }>;
    reasons?: Array<{ code?: string; message: string }>;
    problems?: string[];
  };
};

/**
 * The sentence to show for a refused write, from the API's error body
 * `{ error: { code, message, issues | reasons | problems } }`. A Zod issue
 * names its field; a governance refusal's problems come back separately.
 */
export function apiErrorMessage(body: unknown, status: number, fallback: string): { message: string; problems: string[] } {
  const e = (body as ApiErrorBody | null)?.error;
  const problems = Array.isArray(e?.problems) ? e.problems.filter((p): p is string => typeof p === "string") : [];
  const issue = e?.issues?.[0];
  if (issue) {
    const field = issue.path?.length ? `${issue.path.join(".")}: ` : "";
    return { message: `${field}${issue.message}`, problems };
  }
  const reason = e?.reasons?.[0]?.message;
  if (reason) return { message: reason, problems };
  if (e?.message) return { message: e.message, problems };
  return { message: `${fallback} (HTTP ${status}).`, problems };
}

/* ================================================================ roster */

export type ApiTeamAthlete = {
  id: string;
  displayName: string;
  legalName: string;
  sport: string;
  position: string | null;
  gradYear: number | null;
  state: string;
  teamShareBps: number | null;
};

export type ApiPage = { page: number; size: number; total: number; pages: number };

export type ApiAthletesPage = {
  property: { id: string; name: string; kind: string };
  athletes: ApiTeamAthlete[];
  page: ApiPage;
  counts: { athletes: number; active: number };
};

/** The athlete states `GET /team/athletes?state=` accepts. */
export const ATHLETE_STATES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "SUSPENDED", "FEATURED"] as const;

const ATHLETE_STATE_COPY: Record<string, [string, "neutral" | "primary" | "accent" | "danger" | "warn"]> = {
  DRAFT: ["Draft", "neutral"],
  SUBMITTED: ["Submitted", "primary"],
  UNDER_REVIEW: ["Under review", "warn"],
  APPROVED: ["Approved", "accent"],
  CHANGES_REQUESTED: ["Changes requested", "warn"],
  REJECTED: ["Rejected", "danger"],
  ACTIVE: ["Active", "accent"],
  SUSPENDED: ["Suspended", "danger"],
  FEATURED: ["Featured", "primary"],
};

export function athleteState(state: string): { label: string; tone: "neutral" | "primary" | "accent" | "danger" | "warn" } {
  const [label, tone] = ATHLETE_STATE_COPY[state] ?? [enumLabel(state), "neutral" as const];
  return { label, tone };
}

export const ATHLETE_STATE_OPTIONS = ATHLETE_STATES.map((s) => ({ value: s, label: athleteState(s).label }));

/** 1250 bps → "12.5" for an input; null → "". */
export function shareInput(bps: number | null): string {
  return bps === null ? "" : String(Number((bps / 100).toFixed(2)));
}

/** 1250 bps → "12.5%"; null → "Not set". */
export function shareText(bps: number | null): string {
  return bps === null ? "Not set" : `${shareInput(bps)}%`;
}

/**
 * A typed percentage → basis points. Empty means "not set" (null). The API
 * stores whole basis points 0..10000, so at most two decimals.
 */
export function parseSharePercent(raw: string): { ok: true; bps: number | null } | { ok: false; message: string } {
  const s = raw.trim().replace(/%$/, "").trim();
  if (!s) return { ok: true, bps: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { ok: false, message: "A percentage from 0 to 100, at most two decimals." };
  const bps = Math.round(Number(s) * 100);
  if (bps > 10_000) return { ok: false, message: "The team's share can't be more than 100%." };
  return { ok: true, bps };
}

export function rosterRow(a: ApiTeamAthlete) {
  const st = athleteState(a.state);
  return {
    id: a.id,
    name: a.displayName,
    legalName: a.legalName !== a.displayName ? a.legalName : null,
    sport: a.sport,
    detail: [a.position, a.gradYear ? `Class of ${a.gradYear}` : null].filter(Boolean).join(" · "),
    stateLabel: st.label,
    stateTone: st.tone,
    share: shareText(a.teamShareBps),
    shareSet: a.teamShareBps !== null,
    shareBps: a.teamShareBps,
  };
}

export type RosterDraft = {
  legalName: string;
  displayName: string;
  email: string;
  sport: string;
  position: string;
  gradYear: string;
  birthDate: string;
  ageBand: "" | "UNDER_16" | "16_17" | "18_PLUS";
  teamShare: string;
};

export const EMPTY_ROSTER_DRAFT: RosterDraft = {
  legalName: "", displayName: "", email: "", sport: "", position: "", gradYear: "", birthDate: "", ageBand: "", teamShare: "",
};

/** The body of `POST /team/roster` (RosterAthleteInput). */
export type RosterAthleteInput = {
  legalName: string;
  displayName: string;
  email: string;
  sport: string;
  position?: string | null;
  gradYear?: number | null;
  birthDate?: string | null;
  ageBand?: "UNDER_16" | "16_17" | "18_PLUS" | null;
  teamShareBps?: number | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors RosterAthleteInput, so a slip is caught before the round trip. */
export function validateRosterDraft(d: RosterDraft): { ok: true; input: RosterAthleteInput } | { ok: false; errors: Partial<Record<keyof RosterDraft, string>> } {
  const errors: Partial<Record<keyof RosterDraft, string>> = {};
  const legalName = d.legalName.trim();
  const displayName = d.displayName.trim();
  const email = d.email.trim();
  const sport = d.sport.trim();
  if (!legalName) errors.legalName = "Their legal name.";
  else if (legalName.length > 200) errors.legalName = "At most 200 characters.";
  if (!displayName) errors.displayName = "The name sponsors see.";
  else if (displayName.length > 100) errors.displayName = "At most 100 characters.";
  if (!EMAIL.test(email) || email.length > 320) errors.email = "An email they can sign in with.";
  if (!sport) errors.sport = "Their sport.";
  else if (sport.length > 60) errors.sport = "At most 60 characters.";
  if (d.position.trim().length > 60) errors.position = "At most 60 characters.";
  let gradYear: number | null = null;
  if (d.gradYear.trim()) {
    gradYear = Number(d.gradYear.trim());
    if (!Number.isInteger(gradYear) || gradYear < 1990 || gradYear > 2100) errors.gradYear = "A year such as 2027.";
  }
  if (d.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) || Number.isNaN(new Date(d.birthDate).getTime()))) errors.birthDate = "A date.";
  const share = parseSharePercent(d.teamShare);
  if (!share.ok) errors.teamShare = share.message;
  if (Object.keys(errors).length || !share.ok) return { ok: false, errors };
  return {
    ok: true,
    input: {
      legalName, displayName, email, sport,
      position: d.position.trim() || null,
      gradYear,
      birthDate: d.birthDate || null,
      ageBand: d.ageBand || null,
      teamShareBps: share.bps,
    },
  };
}

/* ============================================================== listings */

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export const LISTING_STATES: readonly ListingState[] = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED", "ARCHIVED"];

export type ApiListing = {
  id: string;
  propertyId: string;
  inventoryItemId: string;
  title: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  state: ListingState;
  publishAt: string | null;
  submittedAt: string | null;
  reviewNotes: string | null;
  decidedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  item: {
    id: string;
    title: string;
    kind: string;
    priceCents: number;
    quantity: number | null;
    availableUntil: string | null;
    active: boolean;
    athleteId: string | null;
    propertyId: string | null;
  };
  propertyName: string;
  blockers: string[];
  /* 2S3-BE-06 — how it went live, why it waits for BTG, and BTG's pause or end. */
  publishedBy?: "AUTOMATIC" | "BTG" | null;
  hold?: ListingHold | null;
  btgAction?: "PAUSED" | "ENDED" | null;
  btgReason?: string | null;
};

const LISTING_COPY: Record<ListingState, [string, "neutral" | "primary" | "accent" | "danger" | "warn", string]> = {
  DRAFT: ["Draft", "neutral", "Only you can see it. Submit it when the checklist is clear — it goes live as soon as the checks pass."],
  PENDING_APPROVAL: ["With BTG", "warn", "BTG is taking a look — we'll email you. Editing it takes it back to a draft to submit again."],
  PUBLISHED: ["On sale", "accent", "Sponsors can find and buy it. Pause it to change the wording."],
  PAUSED: ["Paused", "primary", "Hidden from sponsors. Edit it, then resume — the checks run again."],
  ARCHIVED: ["Archived", "neutral", "Retired for good. List the item again to sell it."],
};

export function listingState(s: ListingState) {
  const [label, tone, detail] = LISTING_COPY[s] ?? [enumLabel(s), "neutral" as const, ""];
  return { label, tone, detail };
}

export const LISTING_STATE_OPTIONS = LISTING_STATES.map((s) => ({ value: s, label: listingState(s).label }));

/** What the owner may do from each state — the state machine's owner moves
 *  (listing-rules.ts). Submitting puts it live when the checks pass
 *  (2S3-BE-06); a listing held for BTG can be edited, which takes it back to
 *  a draft, and submitted again. */
export function listingControls(s: ListingState): {
  editable: boolean;
  canSubmit: boolean;
  moves: Array<{ to: "PAUSED" | "PUBLISHED" | "ARCHIVED"; label: string }>;
} {
  switch (s) {
    case "DRAFT":
      return { editable: true, canSubmit: true, moves: [{ to: "ARCHIVED", label: "Archive" }] };
    case "PENDING_APPROVAL":
      return { editable: true, canSubmit: true, moves: [{ to: "ARCHIVED", label: "Archive" }] };
    case "PUBLISHED":
      return { editable: false, canSubmit: false, moves: [{ to: "PAUSED", label: "Pause" }, { to: "ARCHIVED", label: "Archive" }] };
    case "PAUSED":
      return { editable: true, canSubmit: false, moves: [{ to: "PUBLISHED", label: "Resume" }, { to: "ARCHIVED", label: "Archive" }] };
    default:
      return { editable: false, canSubmit: false, moves: [] };
  }
}

export function listingRow(l: ApiListing) {
  const st = listingState(l.state);
  return {
    id: l.id,
    title: l.title,
    item: `${l.item.title} · ${enumLabel(l.item.kind)}`,
    price: usdCents(l.item.priceCents),
    stateLabel: st.label,
    stateTone: st.tone,
    blockers: l.state === "ARCHIVED" ? 0 : l.blockers.length,
    changesRequested: l.state === "DRAFT" && !!l.reviewNotes,
    updated: dateLabel(l.updatedAt),
  };
}

/** Items that already carry a live (non-archived) listing — the API allows one. */
export function liveListingByItem(listings: ApiListing[]): Map<string, string> {
  return new Map(listings.filter((l) => l.state !== "ARCHIVED").map((l) => [l.inventoryItemId, l.id]));
}

export type ListingDraft = { title: string; description: string; visibility: "PUBLIC" | "PRIVATE"; publishAt: string | null };

export function listingDraftFrom(l: Pick<ApiListing, "title" | "description" | "visibility" | "publishAt">): ListingDraft {
  return { title: l.title, description: l.description ?? "", visibility: l.visibility, publishAt: l.publishAt };
}

/** The ListingInput / ListingPatch fields, checked like the contract does. */
export function validateListingDraft(d: ListingDraft): { ok: true; body: { title: string; description: string | null; visibility: "PUBLIC" | "PRIVATE"; publishAt: string | null } } | { ok: false; message: string } {
  const title = d.title.trim();
  if (!title) return { ok: false, message: "Give the listing a title." };
  if (title.length > 200) return { ok: false, message: "A title is at most 200 characters." };
  if (d.description.length > 8000) return { ok: false, message: "A description is at most 8,000 characters." };
  if (d.visibility !== "PUBLIC" && d.visibility !== "PRIVATE") return { ok: false, message: "Choose who can see it." };
  if (d.publishAt && Number.isNaN(new Date(d.publishAt).getTime())) return { ok: false, message: "The publish date isn't a date." };
  return { ok: true, body: { title, description: d.description.trim() || null, visibility: d.visibility, publishAt: d.publishAt ? new Date(d.publishAt).toISOString() : null } };
}

/** Only the fields that changed — an empty patch is no save at all. */
export function listingPatch(saved: ListingDraft, draft: ListingDraft): Partial<ListingDraft> {
  const out: Partial<ListingDraft> = {};
  if (draft.title.trim() !== saved.title) out.title = draft.title;
  if ((draft.description.trim() || "") !== (saved.description || "")) out.description = draft.description;
  if (draft.visibility !== saved.visibility) out.visibility = draft.visibility;
  const a = saved.publishAt ? new Date(saved.publishAt).getTime() : null;
  const b = draft.publishAt ? new Date(draft.publishAt).getTime() : null;
  if (a !== b) out.publishAt = draft.publishAt;
  return out;
}

/* The publish date is a day, kept as UTC midnight — a date input renders the
   same on the server and in the browser, whatever either's time zone. */
export function publishDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function publishDateIso(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : null;
}

export type CheckRow = { key: string; label: string; ok: boolean; note?: string };

/* The governance rules, in listing-rules.ts' words. Property and item rules
   come from the API's `blockers` (only the server can see them); the
   listing's own wording rules are re-run on the draft, so the checklist
   moves as the manager types. Any blocker we don't recognise is shown as
   its own failing row — never swallowed. */
const SERVER_RULES: Array<{ key: string; label: string; match: string; note: string }> = [
  { key: "property", label: "Your property is approved to list", match: "property:", note: "BTG approves this with your onboarding. If it was withdrawn, ask BTG." },
  { key: "active", label: "The item is active", match: "item: inactive", note: "The item is paused in Inventory." },
  { key: "priced", label: "The item has a price", match: "item: not priced", note: "Set a price on the item in Inventory." },
  { key: "stock", label: "There is stock left to sell", match: "item: none left to sell", note: "The item's quantity is 0." },
  { key: "window", label: "The item is still available", match: "item: availability has ended", note: "Its availability window has closed." },
];

export function governanceChecklist(
  blockers: string[],
  draft: ListingDraft,
  item: { availableUntil: string | null },
): CheckRow[] {
  const rows: CheckRow[] = SERVER_RULES.map((r) => {
    const failing = blockers.some((b) => (r.match.endsWith(":") ? b.startsWith(r.match) : b === r.match));
    return { key: r.key, label: r.label, ok: !failing, ...(failing ? { note: r.note } : {}) };
  });
  const title = draft.title.trim().length > 0;
  const desc = draft.description.trim().length;
  rows.push({ key: "title", label: "The listing has a title", ok: title, ...(title ? {} : { note: "Add a title." }) });
  rows.push({
    key: "description",
    label: "The description is at least 20 characters",
    ok: desc >= 20,
    ...(desc >= 20 ? {} : { note: `${desc} of 20 so far — say what the sponsor gets, when and where.` }),
  });
  const until = item.availableUntil ? new Date(item.availableUntil).getTime() : null;
  const at = draft.publishAt ? new Date(draft.publishAt).getTime() : null;
  const timing = !(until !== null && at !== null && at >= until);
  rows.push({ key: "timing", label: "It publishes before the item stops being available", ok: timing, ...(timing ? {} : { note: "Move the publish date earlier." }) });
  const known = (b: string) => SERVER_RULES.some((r) => (r.match.endsWith(":") ? b.startsWith(r.match) : b === r.match)) || b.startsWith("listing:");
  for (const b of blockers) if (!known(b)) rows.push({ key: `x:${b}`, label: b, ok: false });
  return rows;
}

/* ------------------------------------------------------------ inventory */

export type ApiTeamItem = {
  id: string;
  title: string;
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
  version: number;
  /** The roster athlete's display name, or null for the team's own item. */
  owner: string | null;
};

export type ApiTeamInventoryPage = { inventory: ApiTeamItem[]; page: ApiPage; counts: { items: number; active: number } };

export type ApiInventoryItem = {
  id: string;
  athleteId: string | null;
  propertyId: string | null;
  title: string;
  description: string | null;
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  categories: string[];
  restrictedCategories: string[];
  packageRules: { minQuantity?: number; maxQuantity?: number; bundleOnly?: boolean; exclusive?: boolean; requiresApproval?: boolean } | null;
  active: boolean;
  version: number;
  components: Array<{ quantity: number; component: { id: string; title: string; kind: string; priceCents: number } }>;
};

function windowText(from: string | null, until: string | null): string | null {
  const a = dateLabel(from);
  const b = dateLabel(until);
  if (a && b) return `${a} – ${b}`;
  if (b) return `Until ${b}`;
  if (a) return `From ${a}`;
  return null;
}

export function inventoryOption(i: ApiTeamItem) {
  return {
    id: i.id,
    title: i.title,
    owner: i.owner ?? "Team",
    kind: enumLabel(i.kind),
    price: usdCents(i.priceCents),
    qty: i.quantity === null ? "Open quantity" : `${i.quantity} in stock`,
    window: windowText(i.availableFrom, i.availableUntil),
    active: i.active,
  };
}

/** What the listing points at, for the editor's side panel. */
export function itemSummary(i: Pick<ApiInventoryItem, "title" | "kind" | "priceCents" | "quantity" | "availableUntil" | "active" | "athleteId"> & { availableFrom?: string | null }) {
  return {
    title: i.title,
    kind: enumLabel(i.kind),
    price: usdCents(i.priceCents),
    qty: i.quantity === null ? "Open quantity" : `${i.quantity} in stock`,
    window: windowText(i.availableFrom ?? null, i.availableUntil),
    status: i.active ? "Active" : "Paused",
    owner: i.athleteId ? "A roster athlete's item" : "Your team's item",
    isPackage: i.kind === "PACKAGE",
  };
}

/** A PACKAGE's contents, with what they'd cost bought one by one. */
export function packageContents(i: Pick<ApiInventoryItem, "components" | "priceCents" | "packageRules">) {
  const rows = i.components.map((c) => ({
    id: c.component.id,
    title: c.component.title,
    kind: enumLabel(c.component.kind),
    quantity: c.quantity,
    each: usdCents(c.component.priceCents),
    line: usdCents(c.component.priceCents * c.quantity),
  }));
  const separateCents = i.components.reduce((s, c) => s + c.component.priceCents * c.quantity, 0);
  const rules = i.packageRules ?? {};
  const ruleNotes = [
    rules.bundleOnly ? "Sold only as this bundle" : null,
    rules.exclusive ? "One buyer per period" : null,
    rules.requiresApproval ? "You approve each order (48 hours to answer)" : null,
    rules.minQuantity ? `At least ${rules.minQuantity} per order` : null,
    rules.maxQuantity ? `At most ${rules.maxQuantity} per order` : null,
  ].filter((x): x is string => !!x);
  return {
    rows,
    separately: rows.length ? usdCents(separateCents) : null,
    price: usdCents(i.priceCents),
    rules: ruleNotes,
  };
}

/* ============================================================== earnings */

export type ApiLedger = {
  currency: string;
  bookedRevenueCents: number;
  reversedCents: number;
  paidEarningsCents: number;
  ledgerBalanceCents: number;
  pendingEarnings: { awaitingSponsorPaymentCents: number; availableCents: number; reservedCents: number; totalCents: number };
  reconciles: boolean;
};

export type ApiAnalytics = {
  currency: string;
  revenue: {
    bookedCents: number;
    reversedCents: number;
    netCents: number;
    byMonth: Array<{ month: string; bookedCents: number; reversedCents: number; paidCents: number }>;
  };
  campaignCompletion: { contractedOrders: number; completedOrders: number; cancelledOrders: number; rate: number | null };
  sellThrough: Array<{ itemId: string; title: string; kind: string; stock: number | null; soldUnits: number; rate: number | null }>;
  sponsorMix: Array<{ category: string; bookedCents: number }>;
  payoutTrends: Array<{ month: string; paidCents: number }>;
  averageCpm: number | null;
  averageCpmBasis: string;
  reconciles: boolean;
};

export const PAYOUTS_NOTE = "Payouts start once the payment provider is connected.";

export function buildEarnings(l: ApiLedger, months: ApiAnalytics["revenue"]["byMonth"]) {
  const p = l.pendingEarnings;
  return {
    tiles: [
      { key: "total", label: "Your earnings so far", value: usdCents(p.totalCents), sub: "Awaiting payment + available + reserve" },
      { key: "available", label: "Available", value: usdCents(p.availableCents), sub: "Sponsor has paid; released to you" },
      { key: "reserved", label: "Reserve", value: usdCents(p.reservedCents), sub: "Held until each order closes" },
      { key: "awaiting", label: "Awaiting sponsor payment", value: usdCents(p.awaitingSponsorPaymentCents), sub: "Booked, not paid yet" },
    ],
    /* The ledger's own equation: booked − reversed − paid = balance. Paid is
       a real field, always 0 until payouts exist — labelled so, not shown as
       a payout history. */
    breakdown: [
      { key: "booked", label: "Booked revenue (your share)", value: usdCents(l.bookedRevenueCents) },
      { key: "reversed", label: "Reversed (refunds, cancellations)", value: usdCents(-l.reversedCents) },
      { key: "paid", label: "Paid out", value: usdCents(-l.paidEarningsCents), note: l.paidEarningsCents === 0 ? PAYOUTS_NOTE : undefined },
      { key: "balance", label: "Ledger balance", value: usdCents(l.ledgerBalanceCents), total: true },
    ],
    reconciles: l.reconciles,
    months: [...months]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((m) => ({
        month: m.month,
        label: monthLabel(m.month),
        booked: usdCents(m.bookedCents),
        reversed: m.reversedCents ? usdCents(-m.reversedCents) : "—",
        net: usdCents(m.bookedCents - m.reversedCents),
      })),
    empty: l.bookedRevenueCents === 0 && l.reversedCents === 0 && l.ledgerBalanceCents === 0,
  };
}

/* ============================================================= analytics */

export function sponsorCategoryLabel(c: string): string {
  return c === "UNCATEGORISED" ? "Uncategorised" : categoryLabel(c as BrandCategory);
}

export function buildAnalytics(a: ApiAnalytics) {
  const c = a.campaignCompletion;
  const months = [...a.revenue.byMonth].sort((x, y) => x.month.localeCompare(y.month));
  return {
    kpis: [
      { key: "net", label: "Net revenue", value: usdCents(a.revenue.netCents), sub: `${usdCents(a.revenue.bookedCents)} booked, ${usdCents(a.revenue.reversedCents)} reversed` },
      { key: "orders", label: "Contracted orders", value: String(c.contractedOrders), sub: `${c.completedOrders} completed · ${c.cancelledOrders} cancelled or refunded` },
      { key: "completion", label: "Campaign completion", value: pct(c.rate), sub: c.rate === null ? "No contracted orders yet" : `${c.completedOrders} of ${c.contractedOrders} completed` },
    ],
    months: months.map((m) => ({
      id: m.month,
      label: monthLabel(m.month),
      value: Math.max(m.bookedCents - m.reversedCents, 0),
      display: usdCents(m.bookedCents - m.reversedCents),
      sub: m.reversedCents ? `${usdCents(m.bookedCents)} booked, ${usdCents(m.reversedCents)} reversed` : undefined,
    })),
    sellThrough: a.sellThrough.map((s) => ({
      id: s.itemId,
      title: s.title,
      kind: enumLabel(s.kind),
      stock: s.stock === null ? "Open" : String(s.stock),
      sold: String(s.soldUnits),
      rate: pct(s.rate),
    })),
    mix: a.sponsorMix.map((m) => ({ id: m.category, label: sponsorCategoryLabel(m.category), value: m.bookedCents, display: usdCents(m.bookedCents) })),
    cpm: a.averageCpm === null ? { value: null, basis: a.averageCpmBasis } : { value: usdCents(Math.round(a.averageCpm)), basis: a.averageCpmBasis },
    reconciles: a.reconciles,
  };
}

/* ============================================================== branding */

export type ApiBranding = {
  displayName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  reportFooter: string | null;
  customDomain: string | null;
  /** Whether this login may change it (a manager only on an operated tenant). */
  canEdit: boolean;
};

export type BrandingDraft = { displayName: string; primaryColor: string; accentColor: string; reportFooter: string; customDomain: string };

export function brandingDraftFrom(b: ApiBranding): BrandingDraft {
  return {
    displayName: b.displayName ?? "",
    primaryColor: b.primaryColor ?? "",
    accentColor: b.accentColor ?? "",
    reportFooter: b.reportFooter ?? "",
    customDomain: b.customDomain ?? "",
  };
}

export type BrandingInput = Partial<{
  displayName: string | null;
  logoKey: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  reportFooter: string | null;
  customDomain: string | null;
}>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** BrandingInput from the form — an emptied field clears it (null). */
export function validateBranding(d: BrandingDraft): { ok: true; input: BrandingInput } | { ok: false; errors: Partial<Record<keyof BrandingDraft, string>> } {
  const errors: Partial<Record<keyof BrandingDraft, string>> = {};
  const displayName = d.displayName.trim();
  if (displayName.length > 120) errors.displayName = "At most 120 characters.";
  const primary = d.primaryColor.trim();
  const accent = d.accentColor.trim();
  if (primary && !HEX.test(primary)) errors.primaryColor = "A colour like #1A5CFF.";
  if (accent && !HEX.test(accent)) errors.accentColor = "A colour like #FFB400.";
  const footer = d.reportFooter.trim();
  if (footer.length > 500) errors.reportFooter = "At most 500 characters.";
  const domain = d.customDomain.trim().toLowerCase();
  if (domain && !HOST.test(domain)) errors.customDomain = "A host name such as partners.example.com.";
  else if (domain && /(^|\.)sponsorx\.net$/.test(domain)) errors.customDomain = "Use your organisation's own domain.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      displayName: displayName || null,
      primaryColor: primary ? primary.toUpperCase() : null,
      accentColor: accent ? accent.toUpperCase() : null,
      reportFooter: footer || null,
      customDomain: domain || null,
    },
  };
}

export const LOGO_TYPES = ["image/png", "image/jpeg"] as const;
export const MAX_LOGO_BYTES = 1024 * 1024;

export function validateLogoFile(f: { type: string; size: number }): { ok: true; contentType: (typeof LOGO_TYPES)[number]; bytes: number } | { ok: false; message: string } {
  if (!(LOGO_TYPES as readonly string[]).includes(f.type)) return { ok: false, message: "A logo is a PNG or JPEG." };
  if (f.size < 1) return { ok: false, message: "That file is empty." };
  if (f.size > MAX_LOGO_BYTES) return { ok: false, message: "A logo is at most 1 MB." };
  return { ok: true, contentType: f.type as (typeof LOGO_TYPES)[number], bytes: f.size };
}

/** WCAG relative luminance of "#RRGGBB". */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two "#RRGGBB" colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** How a colour reads with white and black text on it — computed from the
 *  colour itself; 4.5 is WCAG AA for body text. */
export function contrastChecks(hex: string): Array<{ key: string; label: string; ratio: string; passes: boolean }> | null {
  if (!HEX.test(hex)) return null;
  return [
    { key: "white", label: "White text on it", bg: "#FFFFFF" },
    { key: "black", label: "Black text on it", bg: "#000000" },
  ].map((c) => {
    const r = contrastRatio(hex, c.bg);
    return { key: c.key, label: c.label, ratio: `${r.toFixed(1)}:1`, passes: r >= 4.5 };
  });
}
