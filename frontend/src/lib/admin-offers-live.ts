/* --------------------------------------------------------------------------
   2S2-FE-03 (BTG half) — the Offers desk (Claude Design Offers.dc.html,
   views list / empty / offerReq / revise / keep / draft / send / accepted /
   minor / withdraw / form / formLow).

   Formal offers BTG sends athletes. Terms are fixed once sent: to change
   one, BTG withdraws it and sends a revised offer (POST /offers/:id/revise →
   { withdrawn, draft }), or answers the athlete's change request by keeping
   the offer as it is (POST /offers/:id/change-requests/:requestId/keep).

   LIVE (2S2-BE-03, 2S2-FE-03). BTG's staff read their tenant's offers
   (offer read: BTG admin, campaign manager, Sales); BTG admins and campaign
   managers write them (offer write):
     GET  /offers                         every offer, with its change requests
     GET  /offers/:id                     one
     POST /offers                         OfferInput → a DRAFT
     PATCH /offers/:id                    edit a DRAFT
     POST /offers/:id/send | /withdraw | /revise
     POST /offers/:id/change-requests/:requestId/keep { note }
     GET  /offers/athletes?q=             the form's athlete picker
     GET  /campaigns/:id/offer-checks?…   the form's live checks
   The sell price and BTG's margin are BTG's only — the athlete's read of the
   same offer has no sellPrice.

   Pure: shapes, tabs, the words the screens derive, and the form's body.
   -------------------------------------------------------------------------- */

import { centsFromUsd, dateInput, refusalMessage } from "./inventory-live";
import type { PageInfo } from "@/lib/list-query";

export { centsFromUsd, dateInput };

export type OfferState = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

/** Whose offer it is, and who answers it (GET /offers — offerParty). */
export type ApiOfferParty = {
  name: string;
  minor: boolean;
  /** A minor, or an athlete in the 90-day coming-of-age allowance. */
  guardianAnswers: boolean;
  /** Only for a role that may read a date of birth; null otherwise. */
  age: number | null;
  guardianName: string | null;
};

export type ApiChangeRequest = {
  id: string;
  note: string;
  requestedBy: string;
  createdAt: string;
  answeredAt: string | null;
  answeredBy: string | null;
  answer: "KEPT" | "REVISED" | null;
  answerNote: string | null;
  revisedOfferId: string | null;
};

/** One offer as BTG's staff read it. */
export type ApiStaffOffer = {
  id: string;
  campaignId: string;
  athleteId: string;
  jobId: string;
  inventoryItemId: string | null;
  brief: string;
  /** cents — the athlete's pay. */
  compensation: number;
  /** cents — what the sponsor pays for the line. BTG's only. */
  sellPrice: number;
  deliverables: Array<{ title: string; dueDate: string }>;
  usageRights: string;
  exclusivityDays: number | null;
  disclosures: string[];
  expiresAt: string;
  state: OfferState;
  sentAt: string | null;
  respondedAt: string | null;
  termsHash: string | null;
  orderId: string | null;
  createdAt: string;
  createdBy: string | null;
  fromOfferId: string | null;
  campaignName: string;
  sponsorName: string;
  jobName: string;
  athlete: ApiOfferParty;
  changeRequests: ApiChangeRequest[];
};

/* ------------------------------------------------------------------ money */

/** "$1,000.00" */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/* ------------------------------------------------------------------ dates */

/** "Oct 8" (UTC — offer dates are whole UTC days). */
export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 1, 9:12 AM" (UTC) */
export function momentOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** "in 3 days" / "tomorrow" / "today" / "expired". */
export function untilWords(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** A date input's "2026-10-12" → the end of that UTC day, as the API takes it. */
export function endOfDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T23:59:59.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ----------------------------------------------------------------- people */

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Adult" / "Minor · guardian answers" / "Coming of age · guardian answers". */
export function partyWords(p: ApiOfferParty): string {
  if (!p.guardianAnswers) return "Adult";
  return p.minor ? "Minor · guardian answers" : "Coming of age · guardian answers";
}

/** Who answers this offer: the athlete, or their guardian for them. */
export function answerer(p: ApiOfferParty): string {
  return p.guardianAnswers && p.guardianName ? p.guardianName : p.name;
}

/**
 * "Jordan is 16 — Carmen Reyes, guardian, answers this offer." Null for an
 * athlete who answers for themselves. The age is shown only when the API
 * gives it (a role that may read a date of birth).
 */
export function guardianLine(p: ApiOfferParty): string | null {
  if (!p.guardianAnswers) return null;
  const first = firstName(p.name);
  const guardian = p.guardianName ? `${p.guardianName}, guardian,` : "Their guardian";
  if (!p.minor) return `${first} is coming of age — ${guardian} answers this offer until ${first}'s government ID is in.`;
  return `${first} is ${p.age !== null ? p.age : "a minor"} — ${guardian} answers this offer.`;
}

/* --------------------------------------------------------- state and tabs */

export const OFFER_TABS = [
  { key: "needs", label: "Needs you" },
  { key: "drafts", label: "Drafts" },
  { key: "waiting", label: "Waiting for the athlete" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "withdrawn", label: "Withdrawn" },
] as const;
export type OfferTabKey = (typeof OFFER_TABS)[number]["key"];

/** P1-FE-31 — GET /offers?page=&tab=: one desk tab's page, newest first
 *  (change requests the longest-waiting first on Needs you), with how many
 *  stand in each state and in each desk tab. The tab rules (offersByTab
 *  below) now run on the server. */
export type ApiStaffOfferPage = { offers: ApiStaffOffer[]; page: PageInfo; counts: Record<string, number>; tabs: Record<OfferTabKey, number> };

export function offerTab(raw: string | string[] | undefined): (typeof OFFER_TABS)[number] {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return OFFER_TABS.find((t) => t.key === v) ?? OFFER_TABS[0];
}

export function openRequests(o: Pick<ApiStaffOffer, "state" | "changeRequests">): ApiChangeRequest[] {
  return o.state === "SENT" ? o.changeRequests.filter((r) => !r.answeredAt) : [];
}

export function isExpired(o: Pick<ApiStaffOffer, "state" | "expiresAt">, now: Date = new Date()): boolean {
  return o.state === "SENT" && new Date(o.expiresAt) <= now;
}

/**
 * Which tab an offer sits in (beside Needs you). A SENT offer that lapsed
 * without an answer counts with the declined ones — nobody is waiting on it.
 */
export function homeTab(o: Pick<ApiStaffOffer, "state" | "expiresAt" | "changeRequests">, now: Date = new Date()): Exclude<OfferTabKey, "needs"> {
  switch (o.state) {
    case "DRAFT": return "drafts";
    case "ACCEPTED": return "accepted";
    case "DECLINED": return "declined";
    case "WITHDRAWN": return "withdrawn";
    default: return isExpired(o, now) && !openRequests(o).length ? "declined" : "waiting";
  }
}

/** Needs you: a draft, or a sent offer with a change request nobody answered. */
export function needsYou(o: Pick<ApiStaffOffer, "state" | "changeRequests">): boolean {
  return o.state === "DRAFT" || openRequests(o).length > 0;
}

/** Every tab's offers, in the order the desk lists them. */
export function offersByTab(offers: ApiStaffOffer[], now: Date = new Date()): Record<OfferTabKey, ApiStaffOffer[]> {
  const out: Record<OfferTabKey, ApiStaffOffer[]> = { needs: [], drafts: [], waiting: [], accepted: [], declined: [], withdrawn: [] };
  for (const o of offers) {
    if (needsYou(o)) out.needs.push(o);
    const home = homeTab(o, now);
    /* A sent offer with an open request is answered from Needs you. */
    if (!(home === "waiting" && openRequests(o).length)) out[home].push(o);
  }
  const asked = (o: ApiStaffOffer) => openRequests(o)[0]?.createdAt ?? "";
  /* Change requests first, the longest-waiting on top; then drafts, newest first. */
  out.needs.sort((a, b) => {
    const ra = asked(a), rb = asked(b);
    if (ra && rb) return ra.localeCompare(rb);
    if (ra || rb) return ra ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  out.drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  out.waiting.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  for (const k of ["accepted", "declined", "withdrawn"] as const) {
    out[k].sort((a, b) => (b.respondedAt ?? b.expiresAt).localeCompare(a.respondedAt ?? a.expiresAt));
  }
  return out;
}

export type Tone = "primary" | "accent" | "neutral" | "danger" | "warn";
export type StatusBadge = { label: string; tone: Tone; mark: string };

/** The status pill the list and the offer header show. */
export function statusBadge(o: ApiStaffOffer, now: Date = new Date()): StatusBadge {
  switch (o.state) {
    case "DRAFT": return { label: "Draft — not sent", tone: "neutral", mark: "○" };
    case "ACCEPTED": return { label: "Accepted — order created", tone: "accent", mark: "✓" };
    case "DECLINED": return { label: o.athlete.guardianAnswers ? "Declined by the guardian" : "Declined by the athlete", tone: "neutral", mark: "✕" };
    case "WITHDRAWN": return { label: "Withdrawn by BTG", tone: "neutral", mark: "✕" };
    default:
      if (openRequests(o).length) return { label: "Change requested", tone: "warn", mark: "!" };
      if (isExpired(o, now)) return { label: "Expired — no answer", tone: "danger", mark: "✕" };
      return { label: o.athlete.guardianAnswers ? `Waiting for ${answerer(o.athlete)}` : "Waiting for the athlete", tone: "primary", mark: "●" };
  }
}

/** The list's expiry cell: the date, and a word under it. */
export function expiryCell(o: ApiStaffOffer, now: Date = new Date()): { day: string; sub: string; late: boolean } {
  const day = dayOf(o.expiresAt);
  if (o.state === "DRAFT") return { day, sub: "not sent yet", late: false };
  if (o.state === "SENT") {
    const sub = untilWords(o.expiresAt, now);
    return { day, sub, late: sub === "expired" };
  }
  return { day, sub: "", late: false };
}

/** The offer header's "Oct 8 · in 3 days". */
export function expiryHeader(o: ApiStaffOffer, now: Date = new Date()): string {
  return o.state === "SENT" ? `${dayOf(o.expiresAt)} · ${untilWords(o.expiresAt, now)}` : dayOf(o.expiresAt);
}

/* ---------------------------------------------------------------- the offer */

/** "3f9a…c21e" */
export function fingerprint(hash: string): string {
  return hash.length > 8 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
}

export function exclusivityWords(days: number | null, sponsorName: string): string {
  if (!days) return "None — other sponsors are fine.";
  return `${days} day${days === 1 ? "" : "s"} — no offers or sales in ${sponsorName}’s brand categories.`;
}

/** Deliverables in due order: "Instagram post · due Oct 12". */
export function deliverableLines(o: Pick<ApiStaffOffer, "deliverables">): string[] {
  return [...o.deliverables].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((d) => `${d.title} · due ${dayOf(d.dueDate)}`);
}

/** "Oct 12", "Oct 12 and Oct 13", "Oct 12, Oct 13 and Oct 20". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "$400.00 pay · 2 deliverables, due Oct 12 and Oct 13 · expires Oct 8" */
export function sendSummary(t: { compensation: number; deliverables: Array<{ dueDate: string }>; expiresAt: string }): string {
  const n = t.deliverables.length;
  const dues = [...t.deliverables].map((d) => d.dueDate).sort().map(dayOf);
  return `${money(t.compensation)} pay · ${n} deliverable${n === 1 ? "" : "s"}, due ${andList(dues)} · expires ${dayOf(t.expiresAt)}`;
}

/** Who asked for a change: a minor's guardian asks for them; anyone else, themselves. */
export function requesterOf(p: ApiOfferParty): string {
  return p.guardianAnswers && p.guardianName ? `${p.guardianName} (guardian)` : p.name;
}

export type TimelineEntry = { at: string | null; text: string; tone: "text" | "warn" | "ok" | "faint" };

/** The offer's story, oldest first, from its own fields. */
export function offerTimeline(o: ApiStaffOffer, viewerId: string | null): TimelineEntry[] {
  const first = firstName(o.athlete.name);
  const who = requesterOf(o.athlete);
  const out: TimelineEntry[] = [];
  const by = o.createdBy && viewerId && o.createdBy === viewerId ? "you" : "BTG staff";
  out.push({ at: o.createdAt, text: o.fromOfferId ? `Revised copy drafted by ${by}` : `Drafted by ${by}`, tone: "text" });
  if (o.sentAt) {
    out.push({
      at: o.sentAt,
      text: o.athlete.guardianAnswers && o.athlete.guardianName ? `Sent · ${o.athlete.guardianName} emailed to answer for ${first}` : `Sent to ${first} · terms fixed`,
      tone: "text",
    });
  }
  for (const r of o.changeRequests) {
    out.push({ at: r.createdAt, text: `Change requested by ${who}`, tone: "warn" });
    if (r.answeredAt) {
      out.push({
        at: r.answeredAt,
        text: r.answer === "KEPT" ? `Kept as it is · reply emailed to ${first}` : "Revised · withdrawn and copied into a new draft",
        tone: "text",
      });
    }
  }
  if (o.respondedAt && o.state !== "SENT") {
    const text =
      o.state === "ACCEPTED" ? `Accepted by ${answerer(o.athlete)} · order created`
        : o.state === "DECLINED" ? `Declined by ${answerer(o.athlete)}`
          : "Withdrawn by BTG";
    /* A revise's own withdrawal is said once, by its "Revised" line. */
    const revised = o.state === "WITHDRAWN" && o.changeRequests.some((r) => r.answer === "REVISED" && r.answeredAt === o.respondedAt);
    if (!revised) out.push({ at: o.respondedAt, text, tone: o.state === "ACCEPTED" ? "ok" : "text" });
  }
  out.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  if (o.state === "DRAFT") out.push({ at: null, text: "Not sent yet", tone: "faint" });
  if (o.state === "SENT") out.push({ at: null, text: "Accepted, declined or withdrawn: not yet", tone: "faint" });
  return out;
}

/** The revised draft a withdrawn offer was copied into, if it was. */
export function revisedInto(o: Pick<ApiStaffOffer, "changeRequests">): string | null {
  return o.changeRequests.find((r) => r.revisedOfferId)?.revisedOfferId ?? null;
}

/** "Open the order →" — Campaign Orders are worked on the campaign's board, its roster filtered to the athlete. */
export function orderHref(o: Pick<ApiStaffOffer, "campaignId" | "athlete">): string {
  return `/admin/campaigns/${encodeURIComponent(o.campaignId)}?${new URLSearchParams({ q: o.athlete.name })}`;
}

/* --------------------------------------------------------------- the form */

/** The roles that make and change offers (offer write). Sales reads only. */
export const OFFER_WRITERS = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"] as const;
export const mayWriteOffers = (roles: readonly string[]) => roles.some((r) => (OFFER_WRITERS as readonly string[]).includes(r));
export const READ_ONLY_TIP = "Sales can read offers. BTG admins and campaign managers make and change them.";

/** The athlete picker's row (GET /offers/athletes). */
export type ApiOfferAthlete = ApiOfferParty & { id: string; sport: string; tier: string | null };

/** GET /campaigns/:id/offer-checks */
export type ApiOfferChecks = {
  campaignId: string;
  floorCents: number | null;
  floorSource: "ITEM" | "RATE" | null;
  clearsFloor: boolean | null;
  minSellPriceCents: number | null;
  clearsMarginFloor: boolean | null;
  budgetCents: number;
  committedCents: number;
  remainingBudgetCents: number;
  neededCents: number | null;
  fitsBudget: boolean | null;
  marginCents: number | null;
  /** What saving would refuse. The floor, margin and budget ones have their own lines. */
  problems: Array<{ code: "UNKNOWN_JOB" | "NOT_THEIR_ITEM" | "ITEM_FLOOR" | "RATE_FLOOR" | "MARGIN_FLOOR" | "BUDGET"; message: string }>;
};

/** The problems no check line already says (an unknown job, another athlete's item). */
export function otherProblems(c: ApiOfferChecks | null): string[] {
  return (c?.problems ?? []).filter((p) => p.code === "UNKNOWN_JOB" || p.code === "NOT_THEIR_ITEM").map((p) => p.message);
}

export type CheckLine = { text: string; tone: "ok" | "danger" | "muted" };

/** "Pay is above Riley’s floor of $300.00 ✓" / "✕ Below Riley’s floor of $300.00 — raise the pay". */
export function floorLine(c: ApiOfferChecks | null, athlete: string | null, pay: number | null): CheckLine {
  if (!athlete) return { text: "Pick an athlete and a NIL job to check the pay against their floor.", tone: "muted" };
  const first = firstName(athlete);
  if (!c) return { text: "Checking…", tone: "muted" };
  if (c.floorCents === null) {
    return { text: `${first} has no rate for this job on file, so there is no floor to check the pay against.`, tone: "muted" };
  }
  const whose = c.floorSource === "ITEM" ? `${first}’s price for this item` : `${first}’s floor`;
  if (pay === null || c.clearsFloor === null) return { text: `${whose[0]!.toUpperCase()}${whose.slice(1)} is ${money(c.floorCents)}.`, tone: "muted" };
  if (!c.clearsFloor) return { text: `✕ Below ${whose} of ${money(c.floorCents)} — raise the pay`, tone: "danger" };
  return { text: `Pay ${pay === c.floorCents ? "matches" : "is above"} ${whose} of ${money(c.floorCents)} ✓`, tone: "ok" };
}

/** The margin floor, said only when it fails: sell price ≥ pay × 1.4. */
export function marginFloorLine(c: ApiOfferChecks | null): CheckLine | null {
  if (!c || c.clearsMarginFloor !== false || c.minSellPriceCents === null) return null;
  return { text: `✕ Sell price is below the margin floor of ${money(c.minSellPriceCents)} (pay × 1.4) — raise the sell price`, tone: "danger" };
}

/** "Fits the campaign’s remaining budget of $2,100.00 ✓" */
export function budgetLine(c: ApiOfferChecks | null): CheckLine {
  if (!c) return { text: "Pick a campaign to check its budget.", tone: "muted" };
  const left = money(c.remainingBudgetCents);
  if (c.fitsBudget === null) return { text: `The campaign has ${left} of its budget left.`, tone: "muted" };
  if (!c.fitsBudget) return { text: `✕ Over the campaign’s remaining budget of ${left} — this line needs ${money(c.neededCents ?? 0)}`, tone: "danger" };
  return { text: `Fits the campaign’s remaining budget of ${left} ✓`, tone: "ok" };
}

/** Why "Save and send" is off, or null. The floor first — the design's own hint. */
export function sendBlocker(c: ApiOfferChecks | null): string | null {
  if (!c) return null;
  if (c.clearsFloor === false) return "Raise the pay to turn on “Save and send”.";
  if (c.clearsMarginFloor === false) return "Raise the sell price to turn on “Save and send”.";
  if (c.fitsBudget === false) return "Lower the pay to fit the budget to turn on “Save and send”.";
  return c.problems[0]?.message ?? null;
}

/** The query GET /campaigns/:id/offer-checks takes — only what is filled in. */
export function checksQuery(f: { athleteId?: string | null; jobId?: string | null; inventoryItemId?: string | null; compensation?: number | null; sellPrice?: number | null }): string {
  const u = new URLSearchParams();
  if (f.athleteId) u.set("athleteId", f.athleteId);
  if (f.jobId) u.set("jobId", f.jobId);
  if (f.inventoryItemId) u.set("inventoryItemId", f.inventoryItemId);
  if (f.compensation != null) u.set("compensation", String(f.compensation));
  if (f.sellPrice != null) u.set("sellPrice", String(f.sellPrice));
  return u.toString();
}

/** What the form holds — text as typed. */
export type OfferFields = {
  campaignId: string;
  athleteId: string;
  jobId: string;
  inventoryItemId: string;
  brief: string;
  pay: string;
  sell: string;
  deliverables: Array<{ title: string; due: string }>;
  usageRights: string;
  exclusivityDays: string;
  expires: string;
  disclosures: string[];
};

/** OfferInput, from the form — or what to fix first. The API asks it all again. */
export type OfferBody = {
  campaignId: string; athleteId: string; jobId: string; inventoryItemId: string | null; brief: string;
  compensation: number; sellPrice: number; deliverables: Array<{ title: string; dueDate: string }>;
  usageRights: string; exclusivityDays: number | null; disclosures: string[]; expiresAt: string;
};

export function offerBody(f: OfferFields): { ok: true; body: OfferBody } | { ok: false; message: string } {
  if (!f.campaignId) return { ok: false, message: "Pick the campaign." };
  if (!f.athleteId) return { ok: false, message: "Pick the athlete." };
  if (!f.jobId) return { ok: false, message: "Pick the NIL job." };
  const brief = f.brief.trim();
  if (!brief) return { ok: false, message: "Write the brief — what the athlete agrees to do." };
  const compensation = centsFromUsd(f.pay);
  if (!compensation) return { ok: false, message: "Athlete’s pay: a dollar amount above zero, like 400.00." };
  const sellPrice = centsFromUsd(f.sell);
  if (!sellPrice) return { ok: false, message: "Sell price: a dollar amount above zero, like 650.00." };
  const rows = f.deliverables.filter((d) => d.title.trim() || d.due);
  if (!rows.length) return { ok: false, message: "Add at least one deliverable, with its due date." };
  if (rows.length > 20) return { ok: false, message: "An offer schedules at most 20 deliverables." };
  const deliverables: OfferBody["deliverables"] = [];
  for (const [i, d] of rows.entries()) {
    const dueDate = endOfDay(d.due);
    if (!d.title.trim()) return { ok: false, message: `Deliverable ${i + 1} needs a title.` };
    if (!dueDate) return { ok: false, message: `Deliverable ${i + 1} needs a due date.` };
    deliverables.push({ title: d.title.trim(), dueDate });
  }
  const usageRights = f.usageRights.trim();
  if (!usageRights) return { ok: false, message: "Say what the sponsor may do with the content (usage rights)." };
  let exclusivityDays: number | null = null;
  if (f.exclusivityDays.trim()) {
    const n = Number(f.exclusivityDays.trim());
    if (!Number.isInteger(n) || n < 0 || n > 730) return { ok: false, message: "Exclusivity: whole days, 0 to 730 — or leave it empty." };
    exclusivityDays = n;
  }
  const expiresAt = endOfDay(f.expires);
  if (!expiresAt) return { ok: false, message: "Set the date the offer expires." };
  const disclosures = [...new Set(f.disclosures.map((d) => d.trim()).filter(Boolean))];
  if (disclosures.length > 10) return { ok: false, message: "At most 10 disclosures." };
  return {
    ok: true,
    body: {
      campaignId: f.campaignId, athleteId: f.athleteId, jobId: f.jobId, inventoryItemId: f.inventoryItemId || null,
      brief, compensation, sellPrice, deliverables, usageRights, exclusivityDays, disclosures, expiresAt,
    },
  };
}

/** A draft, back into the form's fields (editing). */
export function fieldsOf(o: ApiStaffOffer): OfferFields {
  return {
    campaignId: o.campaignId, athleteId: o.athleteId, jobId: o.jobId, inventoryItemId: o.inventoryItemId ?? "",
    brief: o.brief, pay: (o.compensation / 100).toFixed(2), sell: (o.sellPrice / 100).toFixed(2),
    deliverables: o.deliverables.map((d) => ({ title: d.title, due: dateInput(d.dueDate) })),
    usageRights: o.usageRights, exclusivityDays: o.exclusivityDays == null ? "" : String(o.exclusivityDays),
    expires: dateInput(o.expiresAt), disclosures: [...o.disclosures],
  };
}

/** A new offer's starting fields: the two disclosures every paid post carries. */
export function blankFields(campaignId = ""): OfferFields {
  return {
    campaignId, athleteId: "", jobId: "", inventoryItemId: "", brief: "", pay: "", sell: "",
    deliverables: [{ title: "", due: "" }], usageRights: "", exclusivityDays: "", expires: "", disclosures: ["#ad", "Paid partnership"],
  };
}

/* ── the pre-filled offer (P4-FE-08) ──────────────────────────────────────
   GET /campaigns/:id/offer-draft?athleteId=&jobId= fills every field from
   the records that decide it and says where each came from. The form opens
   on it; BTG can change anything, and saving asks every rule as before. */

/** The draft as the API answers it. `offer` is OfferInput. */
export type ApiOfferDraft = {
  campaignId: string;
  athlete: ApiOfferParty & { id: string };
  job: { id: string; name: string };
  offer: OfferBody;
  sources: Record<"brief" | "compensation" | "sellPrice" | "deliverables" | "usageRights" | "exclusivityDays" | "disclosures" | "expiresAt", string>;
};

/** The form fields a "Filled from …" note can sit under. */
export type FilledField = "brief" | "pay" | "sell" | "deliverables" | "usageRights" | "exclusivityDays" | "expires" | "disclosures";
export type FieldSources = Partial<Record<FilledField, string>>;

/** The draft, into the form's fields (text as typed). */
export function draftFields(d: ApiOfferDraft): OfferFields {
  const o = d.offer;
  return {
    campaignId: o.campaignId, athleteId: o.athleteId, jobId: o.jobId, inventoryItemId: o.inventoryItemId ?? "",
    brief: o.brief, pay: (o.compensation / 100).toFixed(2), sell: (o.sellPrice / 100).toFixed(2),
    deliverables: o.deliverables.map((x) => ({ title: x.title, due: dateInput(x.dueDate) })),
    usageRights: o.usageRights, exclusivityDays: o.exclusivityDays == null ? "" : String(o.exclusivityDays),
    expires: dateInput(o.expiresAt), disclosures: [...o.disclosures],
  };
}

/** The API's per-field sources, keyed by the form's fields. */
export function draftSources(d: ApiOfferDraft): FieldSources {
  const s = d.sources;
  return {
    brief: s.brief, pay: s.compensation, sell: s.sellPrice, deliverables: s.deliverables,
    usageRights: s.usageRights, exclusivityDays: s.exclusivityDays, expires: s.expiresAt, disclosures: s.disclosures,
  };
}

/** The "Filled from …" note for a field — only while it still holds the
 *  drafted value, for the campaign, athlete and job it was drafted for: once
 *  BTG changes any of those, the note would no longer be true. */
export function filledNote(sources: FieldSources | undefined, drafted: OfferFields, now: OfferFields, field: FilledField): string | null {
  const why = sources?.[field];
  if (!why) return null;
  if (drafted.campaignId !== now.campaignId || drafted.athleteId !== now.athleteId || drafted.jobId !== now.jobId) return null;
  if (JSON.stringify(drafted[field]) !== JSON.stringify(now[field])) return null;
  /* "From Riley's rate card" reads as "Filled from Riley's rate card". */
  if (why.startsWith("From ")) return `Filled from ${why.slice(5)}.`;
  /* Lower-case a plain opening word ("The …"), never an acronym ("BTG's …"). */
  return `Filled in: ${/^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why}.`;
}

/** GET /campaigns/:id/offer-draft's query. */
export function offerDraftQuery(athleteId: string, jobId: string): string {
  return new URLSearchParams({ athleteId, jobId }).toString();
}

/** BTG's words for a refused write, from the API's error body. */
export function offerRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only BTG admins and campaign managers can make or change offers — and only their own tenant's.";
  return refusalMessage(body) ?? `${fallback} (HTTP ${status}).`;
}
