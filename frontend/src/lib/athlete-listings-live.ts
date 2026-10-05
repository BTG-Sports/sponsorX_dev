/* --------------------------------------------------------------------------
   2S3-FE-02 — "List my item" (Claude Design ListMyItem.dc.html), over
   2S3-BE-05: an athlete BTG approved, with no team, lists an item of their
   own inventory; a roster athlete cannot — their team lists for them.

     GET  /listings                    every listing of the athlete's items —
                                       their own AND their team's of them
                                       (scope "own" read); writes only reach
                                       the ones they sell themselves
     GET  /inventory, /inventory/:id   the athlete's own items
     POST /listings                    create (DRAFT); 409 "You're on a team —
                                       <team> lists your items" for a roster
                                       athlete, 409 until BTG approves them
     PATCH /listings/:id               wording — DRAFT, PAUSED, or held for
                                       BTG (the edit takes it back to DRAFT)
     POST /listings/:id/submit         DRAFT → PUBLISHED when the checks pass,
                                       else PENDING_APPROVAL with `hold`; 422
                                       with error.problems[] while governance
                                       fails
     POST /listings/:id/transition     PAUSED · PUBLISHED (resume) · ARCHIVED
     GET  /athletes/me                 the athlete's own state (approved?)
     GET  /restrictions                the categories they won't promote
     GET  /payouts/account             their payout account's status

   2S3-BE-06 / 2S3-FE-04 (programme owner, 2026-10-02): a listing goes live
   by itself as soon as its checks pass — the design's original wording — and
   BTG takes a look only when something flags it (restricted words, the
   account's standing, a BTG pause). Pure: shapes and every derived word;
   figures are API fields.
   -------------------------------------------------------------------------- */

import { kindLabel } from "@/lib/inventory-live";
import type { ListingHold } from "@/lib/listing-outcome";

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";

/** GET /listings, /listings/:id — domain/listing.ts `view()`. */
export type ApiAthleteListing = {
  id: string;
  propertyId: string | null;
  sellerAthleteId: string | null;
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
  propertyName: string | null;
  seller: { type: "PROPERTY" | "ATHLETE"; id: string; name: string };
  blockers: string[];
  /* 2S3-BE-06 — how it went live, why BTG is taking a look, and BTG's pause or end. */
  publishedBy?: "AUTOMATIC" | "BTG" | null;
  hold?: ListingHold | null;
  btgAction?: "PAUSED" | "ENDED" | null;
  btgReason?: string | null;
};

/** The item fields the screens read (GET /inventory · /inventory/:id). */
export type ListableItem = {
  id: string;
  title: string;
  description?: string | null;
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableUntil: string | null;
  active: boolean;
};

export const SELLING_STATES: readonly string[] = ["APPROVED", "ACTIVE"];
export const MIN_DESCRIPTION = 20;
export const MAX_DESCRIPTION = 8000;

/* ---------------------------------------------------------------- words */

/** 50000 → "$500"; 12550 → "$125.50". */
export function price(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function qtyWords(q: number | null): string {
  if (q === null) return "open quantity";
  if (q === 0) return "none left to sell";
  return `${q} to sell`;
}

/** "Camp or clinic · $500 each · 4 to sell" */
export function itemLine(i: Pick<ListableItem, "kind" | "priceCents" | "quantity">): string {
  return `${kindLabel(i.kind)} · ${price(i.priceCents)} each · ${qtyWords(i.quantity)}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/** "Oct 1, 11:02 am UTC" */
export function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).toLowerCase();
  return `${day}, ${time} UTC`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** The status pill — words and a mark, never colour alone. */
export function listingBadge(l: Pick<ApiAthleteListing, "state" | "reviewNotes" | "publishAt"> | null, now = new Date()): { label: string; tone: Tone; mark: string } {
  if (!l) return { label: "Not listed yet", tone: "neutral", mark: "○" };
  switch (l.state) {
    case "DRAFT":
      return l.reviewNotes ? { label: "Changes asked", tone: "warn", mark: "!" } : { label: "Not listed yet", tone: "neutral", mark: "○" };
    case "PENDING_APPROVAL": return { label: "BTG is taking a look", tone: "warn", mark: "●" };
    case "PUBLISHED":
      return l.publishAt && new Date(l.publishAt) > now ? { label: "Checks passed · not live yet", tone: "primary", mark: "●" } : { label: "Live", tone: "accent", mark: "✓" };
    case "PAUSED": return { label: "Paused", tone: "neutral", mark: "Ⅱ" };
    case "ARCHIVED": return { label: "Ended", tone: "neutral", mark: "■" };
  }
}

export type TrackStep = { label: string; state: "done" | "current" | "todo"; note: string };

/** Submitted → Live → Paused → Ended (the design's four), for a submitted listing. */
export function listingTrack(l: ApiAthleteListing): TrackStep[] {
  const at = { DRAFT: -1, PENDING_APPROVAL: 0, PUBLISHED: 1, PAUSED: 2, ARCHIVED: 3 }[l.state];
  const notes = [stamp(l.submittedAt), l.publishedAt ? `Since ${stamp(l.publishedAt)}` : "", "", ""];
  return ["Submitted", "Live", "Paused", "Ended"].map((label, i) => ({
    label,
    state: i < at ? "done" : i === at ? "current" : "todo",
    note: notes[i] || (i === at ? "Now" : i > 1 ? "Only if you choose" : ""),
  }));
}

/** The sentence under the track. */
export function statusText(l: ApiAthleteListing, now = new Date()): string {
  switch (l.state) {
    case "DRAFT":
      return l.reviewNotes
        ? "BTG asked for changes. Make them below, then submit it again."
        : "Not submitted yet — only you can see it. Submit it: it goes live as soon as the checks pass.";
    case "PENDING_APPROVAL":
      return `Submitted ${stamp(l.submittedAt)}. BTG is taking a look — we’ll email you. You can still edit what the sponsor gets; that takes it back to a draft to submit again.`;
    case "PUBLISHED":
      if (l.publishAt && new Date(l.publishAt) > now) return `The checks passed. It goes live on ${stamp(l.publishAt)}.`;
      return `Live on the marketplace since ${stamp(l.publishedAt)}. Sponsors can buy it now. Pausing hides it; ending stops it for good.`;
    case "PAUSED":
      return "Paused — hidden from sponsors. Edit what the sponsor gets if you like, then resume it; the checks run again.";
    case "ARCHIVED":
      return "Ended — it’s off the marketplace for good. Orders already placed carry on. List the item again to sell it.";
  }
}

/** What the athlete may do from each state (listing-rules.ts' owner moves).
 *  A listing held for BTG can be edited and submitted again (2S3-BE-06). */
export function ownerControls(s: ListingState): { editable: boolean; canSubmit: boolean; pause: boolean; resume: boolean; end: boolean } {
  return {
    editable: s === "DRAFT" || s === "PAUSED" || s === "PENDING_APPROVAL",
    canSubmit: s === "DRAFT" || s === "PENDING_APPROVAL",
    pause: s === "PUBLISHED",
    resume: s === "PAUSED",
    end: s !== "ARCHIVED",
  };
}

/* ------------------------------------------------------ who sells it */

/**
 * Whether the athlete is on a team, from what the API already says: a
 * listing of their item sold by a property is their team's, and their own
 * listing's blockers name it. Null team name when only the blocker says so.
 * (No read names the athlete's team directly — GET /athletes/me carries no
 * propertyId.) A create refused with 409 says the same, in the API's words.
 */
export function teamFromListings(listings: readonly ApiAthleteListing[]): { onTeam: boolean; teamName: string | null } {
  const teamListing = listings.find((l) => l.seller.type === "PROPERTY" && l.state !== "ARCHIVED");
  if (teamListing) return { onTeam: true, teamName: teamListing.seller.name };
  const blocked = listings.some((l) => l.seller.type === "ATHLETE" && l.blockers.some((b) => b.startsWith("athlete: on a team")));
  return { onTeam: blocked, teamName: null };
}

export function isOwn(l: Pick<ApiAthleteListing, "seller">): boolean {
  return l.seller.type === "ATHLETE";
}

/** Own items with no live (non-archived) listing — the API allows one per item. */
export function itemsToList<T extends ListableItem>(items: readonly T[], listings: readonly ApiAthleteListing[]): T[] {
  const taken = new Set(listings.filter((l) => l.state !== "ARCHIVED").map((l) => l.inventoryItemId));
  return items.filter((i) => !taken.has(i.id));
}

/* ----------------------------------------------------------- the checks */

export type CheckStatus = "ready" | "fix" | "optional";
export type ListCheck = { key: string; label: string; status: CheckStatus; note?: string; cta?: { label: string; href: string } };

export const CHECK_WORD: Record<CheckStatus, string> = { ready: "Ready", fix: "To fix", optional: "Optional" };

const has = (blockers: readonly string[], b: string) => blockers.includes(b);

/** "What the sponsor gets is written" — re-run on every keystroke. */
export function descriptionCheck(text: string): ListCheck {
  const n = text.trim().length;
  return n >= MIN_DESCRIPTION
    ? { key: "description", label: "What the sponsor gets is written", status: "ready" }
    : { key: "description", label: "What the sponsor gets is written", status: "fix", note: `${n} of ${MIN_DESCRIPTION} characters so far — say what they get, when and where.` };
}

/**
 * The aside's checklist, in the design's order. Item and seller rules come
 * from the item and, once a listing exists, the API's `blockers` (only the
 * server sees them all); brand categories and the payout account are
 * shown for the seller's benefit but never stop a listing.
 */
export function listChecks(input: {
  item: ListableItem;
  description: string;
  blockers: readonly string[];
  /** GET /athletes/me `state`; null when it couldn't be read. */
  athleteState: string | null;
  /** The categories the athlete won't promote; null when unreadable. */
  wontPromote: readonly string[] | null;
  /** GET /payouts/account `status`; null when unreadable. */
  payout: "NOT_SET_UP" | "NEEDS_INFO" | "READY" | null;
  now?: Date;
}): ListCheck[] {
  const { item, blockers } = input;
  const now = input.now ?? new Date();
  const rows: ListCheck[] = [];

  rows.push(item.title.trim()
    ? { key: "title", label: `A clear title and kind: “${item.title}”, ${kindLabel(item.kind).toLowerCase()}`, status: "ready" }
    : { key: "title", label: "A clear title and kind", status: "fix", note: "Give the item a title in Inventory." });

  const unpriced = item.priceCents < 100 || has(blockers, "item: not priced");
  const soldOut = item.quantity === 0 || has(blockers, "item: none left to sell");
  rows.push({
    key: "price",
    label: `Price set: ${price(item.priceCents)} each, ${qtyWords(item.quantity)}`,
    status: unpriced || soldOut ? "fix" : "ready",
    ...(unpriced ? { note: "Set a price on the item in Inventory." } : soldOut ? { note: "None left to sell — add stock in Inventory." } : {}),
  });

  const paused = !item.active || has(blockers, "item: inactive");
  const ended = (item.availableUntil !== null && new Date(item.availableUntil) <= now) || has(blockers, "item: availability has ended");
  rows.push({
    key: "available",
    label: "The item is active and still on offer",
    status: paused || ended ? "fix" : "ready",
    ...(paused ? { note: "The item is paused in Inventory." } : ended ? { note: "Its availability window has closed." } : {}),
  });

  rows.push(descriptionCheck(input.description));

  const notApproved = has(blockers, "athlete: not approved by BTG") || (input.athleteState !== null && !SELLING_STATES.includes(input.athleteState));
  rows.push(notApproved
    ? { key: "seller", label: "Your profile is approved", status: "fix", note: "Listing opens once your profile is approved." }
    : { key: "seller", label: "Your profile is approved", status: "ready" });

  if (input.wontPromote) {
    rows.push(input.wontPromote.length
      ? { key: "brands", label: `Brands you won’t work with set: ${input.wontPromote.join(", ")}`, status: "ready" }
      : { key: "brands", label: "Brands you won’t work with", status: "optional", note: "None set. Add any in Inventory — they apply to every item.", cta: { label: "Set them in Inventory", href: "/athlete/inventory" } });
  }

  if (input.payout) {
    rows.push(input.payout === "READY"
      ? { key: "payout", label: "Payout account ready on Stripe", status: "ready" }
      : {
          key: "payout", label: "Payout account ready on Stripe", status: "optional",
          note: input.payout === "NEEDS_INFO" ? "Stripe needs a little more from you. It’s needed before you’re paid, not to list." : "Not set up yet. It’s needed before you’re paid, not to list.",
          cta: { label: input.payout === "NEEDS_INFO" ? "Finish on Stripe" : "Set up payouts on Stripe", href: "/athlete/money" },
        });
  }

  /* Anything the API names that we don't, shown as its own row — never swallowed. */
  const known = (b: string) => b.startsWith("item:") || b.startsWith("listing:") || b.startsWith("athlete:");
  for (const b of blockers) if (!known(b)) rows.push({ key: `x:${b}`, label: b, status: "fix" });
  /* Listing rules the rows above don't cover (title, timing). */
  for (const b of blockers) {
    if (b === "listing: no title") rows.push({ key: "x:title", label: "The listing has a title", status: "fix" });
    if (b.startsWith("listing: publishes after")) rows.push({ key: "x:timing", label: "It goes live before the item stops being available", status: "fix" });
  }
  return rows;
}

/* --------------------------------------------------------------- writes */

export function validateDescription(text: string): { ok: true; value: string } | { ok: false; message: string } {
  const t = text.trim();
  if (t.length > MAX_DESCRIPTION) return { ok: false, message: `At most ${MAX_DESCRIPTION.toLocaleString("en-US")} characters.` };
  return { ok: true, value: t };
}

/** A starting sentence for the textarea, from the item itself. */
export function suggestedDescription(item: Pick<ListableItem, "description">): string {
  return item.description?.trim() ?? "";
}
