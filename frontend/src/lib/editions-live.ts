import type { AdSlotKind, EditionPage, EditionSlot, SplitPayeeKind } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   P9-FE-03 / -04 / -05 — SponsorX NEXT editions as the API answers them
   (GET /editions, /editions/:id/ledger, /editions/:id/splits,
   /editions/:id/sale-candidates), translated into the shapes the finished
   page map, ledger and splits screens already draw.

   What the ledger does NOT have, and so the live screens do not show: a
   RESERVED state (a slot is sold to a campaign or it is open — holds are not
   in the schema), and an editorial working title per page. Pages are drawn
   from the slot codes ("P04-QTR" sits on page 4) and the edition's page
   count; a page with no position is editorial, because that is what it is.
   -------------------------------------------------------------------------- */

export type ApiEditionState =
  | "PLANNING" | "SELLING" | "CLOSED" | "IN_PRODUCTION" | "PUBLISHED_DIGITAL" | "PRINTED" | "DISTRIBUTED" | "CANCELLED";

export type ApiEdition = {
  id: string;
  label: string;
  state: ApiEditionState;
  closeDate: string;
  publishTarget: string;
  printDate: string | null;
  pageCount: number | null;
  thresholdCents: number;
  contentReady: boolean;
  rightsCleared: boolean;
  revenueMet: boolean;
  publication: { id: string; name: string; propertyId: string | null };
  inventory: { total: number; sold: number; committedCents: number; rackCents: number };
  /** Assets with no digital right in force at the publish target — null where the caller can't read assets. */
  rightsPending: number | null;
};

export type ApiSlotKind = AdSlotKind | "PRESENTING";

export type ApiLedgerSlot = {
  id: string;
  slotCode: string;
  kind: ApiSlotKind;
  page: number | null;
  priceCents: number;
  sold: boolean;
  soldCents: number | null;
  soldAt: string | null;
  /** Only for a caller who may read campaigns — a student sees "taken", not who. */
  buyer?: { campaignId: string; campaign: string; sponsor: string };
};

export type ApiSplit = {
  payeeKind: SplitPayeeKind;
  bps: number;
  /** cents — absent where §15.4 denies it */
  amountCents?: number;
  computedAt: string;
};

export type ApiSaleCandidate = {
  campaignId: string;
  campaign: string;
  sponsor: string;
  package: { code: string; name: string; priceCents: number };
  positions: ApiSlotKind[];
  holdsPlacements: boolean;
  /** Kinds this edition has no open position left for. */
  unavailable: ApiSlotKind[];
};

/** The edition a screen opens on: the one asked for, else the one selling,
 *  else the most recent. */
export function pickEdition(editions: ApiEdition[], wanted?: string): ApiEdition | null {
  return (
    editions.find((e) => e.id === wanted) ??
    editions.find((e) => e.state === "SELLING") ??
    editions[0] ??
    null
  );
}

const MS_DAY = 86_400_000;

/** Whole days until an instant, never negative. */
export function daysUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / MS_DAY));
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function slotOf(s: ApiLedgerSlot & { kind: AdSlotKind }): EditionSlot {
  return {
    code: s.slotCode,
    kind: s.kind,
    state: s.sold ? "SOLD" : "OPEN",
    rackCents: s.priceCents,
    ...(s.soldCents != null ? { soldCents: s.soldCents } : {}),
    ...(s.buyer ? { sponsor: s.buyer.sponsor } : {}),
  };
}

const onPage = (s: ApiLedgerSlot): s is ApiLedgerSlot & { kind: AdSlotKind } =>
  s.kind !== "PRESENTING" && s.kind !== "BACK_COVER";

/** Ledger → flatplan. Pages run 1…max(pageCount, highest slotted page). */
export function toFlatplan(
  slots: ApiLedgerSlot[],
  pageCount: number | null,
): { pages: EditionPage[]; backCover: EditionSlot | null; presenting: ApiLedgerSlot | null; unplaced: ApiLedgerSlot[] } {
  const placed = slots.filter((s) => onPage(s) && s.page != null && s.page > 0);
  const last = Math.max(pageCount ?? 0, ...placed.map((s) => s.page!), 1);
  const pages: EditionPage[] = [];
  for (let n = 1; n <= last; n++) {
    const here = placed.filter((s) => s.page === n).map((s) => slotOf(s as ApiLedgerSlot & { kind: AdSlotKind }));
    pages.push(
      here.length
        ? { page: n, title: `${here.length} position${here.length === 1 ? "" : "s"}`, slots: here }
        : { page: n, title: n === 1 ? "Cover" : "Editorial", editorial: true, slots: [] },
    );
  }
  const back = slots.find((s) => s.kind === "BACK_COVER");
  return {
    pages,
    backCover: back ? slotOf(back as ApiLedgerSlot & { kind: AdSlotKind }) : null,
    presenting: slots.find((s) => s.kind === "PRESENTING") ?? null,
    /* a page slot whose code names no page — shown in the ledger, not lost */
    unplaced: slots.filter((s) => onPage(s) && (s.page == null || s.page <= 0)),
  };
}

export type LiveInventoryRow = {
  code: string;
  /** 0 = back cover, -1 = presenting / not on a page. */
  page: number;
  pageTitle: string;
  kind: ApiSlotKind;
  rackCents: number;
  state: "SOLD" | "OPEN";
  buyer?: string;
  holdFor?: string;
  soldCents?: number;
};

export function toInventoryRows(slots: ApiLedgerSlot[]): LiveInventoryRow[] {
  return slots.map((s) => {
    const page = s.kind === "BACK_COVER" ? 0 : s.kind === "PRESENTING" || s.page == null ? -1 : s.page;
    return {
      code: s.slotCode,
      page,
      pageTitle: page === 0 ? "Back cover" : page === -1 ? (s.kind === "PRESENTING" ? "Presenting sponsor" : "Not on a page") : "",
      kind: s.kind,
      rackCents: s.priceCents,
      state: s.sold ? "SOLD" : "OPEN",
      ...(s.buyer ? { buyer: s.buyer.sponsor, holdFor: s.buyer.campaign } : s.sold ? { buyer: "Taken" } : {}),
      ...(s.soldCents != null ? { soldCents: s.soldCents } : {}),
    };
  });
}

/** The ledger's four tiles, from the rows themselves. */
export function inventoryTotals(rows: Array<{ rackCents: number; soldCents?: number; state: string }>) {
  const sold = rows.filter((r) => r.state === "SOLD");
  return {
    committed: sold.reduce((n, r) => n + (r.soldCents ?? 0), 0),
    openRack: rows.filter((r) => r.state === "OPEN").reduce((n, r) => n + r.rackCents, 0),
    rack: rows.reduce((n, r) => n + r.rackCents, 0),
    soldCount: sold.length,
    sellThrough: rows.length ? Math.round((sold.length / rows.length) * 100) : 0,
  };
}

/** Per-kind rack range, for the rail's rack card — real prices, not the fixture card. */
export function rackByKind(slots: ApiLedgerSlot[]): Array<{ kind: ApiSlotKind; min: number; max: number; sold: number; total: number }> {
  const order: ApiSlotKind[] = ["FULL", "HALF", "QUARTER", "BACK_COVER", "PRESENTING"];
  return order.flatMap((kind) => {
    const of = slots.filter((s) => s.kind === kind);
    if (!of.length) return [];
    const prices = of.map((s) => s.priceCents);
    return [{ kind, min: Math.min(...prices), max: Math.max(...prices), sold: of.filter((s) => s.sold).length, total: of.length }];
  });
}

export const PAYEE_LABEL: Record<SplitPayeeKind, string> = {
  SPONSORX: "SponsorX",
  SCHOOL: "The school",
  STUDENT_POOL: "Student scholarship pool",
  EDITORIAL_FUND: "Editorial fund",
};

/** What each payee kind is — policy text, the same for every edition. A
 *  regional edition (no school on the publication) pays schools through the
 *  SALES and CONTENT pools instead of one school (P9-BE-14). */
export function payeeBlurb(kind: SplitPayeeKind, regional: boolean): string {
  switch (kind) {
    case "SPONSORX":
      return "Production, print, sales operations and the platform.";
    case "SCHOOL":
      return regional
        ? "Shared across the participating schools by the sales and content pool formula."
        : "The school's share — paid to the program, not a person.";
    case "STUDENT_POOL":
      return "Funds the points program. Never paid to a student directly — points are recognition, not wages (§5.5).";
    case "EDITORIAL_FUND":
      return "Cameras, recorders, section budgets — the newsroom's gear money.";
  }
}

/** Splits in their fixed payee order; an absent amount stays absent. */
export function orderSplits(splits: ApiSplit[]): ApiSplit[] {
  const order: SplitPayeeKind[] = ["SPONSORX", "SCHOOL", "STUDENT_POOL", "EDITORIAL_FUND"];
  return [...splits].sort((a, b) => order.indexOf(a.payeeKind) - order.indexOf(b.payeeKind));
}

/** A split resolves when the edition closes; before that there is nothing to show. */
export const SPLIT_STATES: ApiEditionState[] = ["CLOSED", "IN_PRODUCTION", "PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED"];
