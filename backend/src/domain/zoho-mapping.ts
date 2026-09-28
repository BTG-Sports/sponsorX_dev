/**
 * SponsorX ↔ Zoho field mapping, as pure functions — P8-INT-01/02,
 * documentation/SponsorX-Zoho-Field-Mapping.md §3, §7, §8.
 *
 * No database, no network. Everything here is a rule from the mapping
 * document, and keeping it pure is what lets the rules be tested one clause
 * at a time.
 *
 * THE SHARED PROJECTION IS THE WHOLE LOOP-PREVENTION MECHANISM.
 * For each object there is exactly one canonical shape of the fields both
 * systems write (`*Shared`). The outbound side builds it from our row, the
 * inbound side builds it from Zoho's record, and both hash it the same way.
 * So "the hash is unchanged" means the same thing in either direction, and
 * an echo — Zoho notifying us about the write we just made, or us about to
 * push back the value Zoho just gave us — is recognisable as one.
 */
import { createHash } from "node:crypto";

import type { BriefState } from "./brief-state";
import type { CampaignState } from "./campaign-state";

export type SyncOrigin = "SPONSORX" | "ZOHO";

/* ── Hashing ─────────────────────────────────────────────────────────────── */

/** JSON with sorted keys, so field order can never change a hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function syncHash(shared: unknown): string {
  return createHash("sha256").update(stableStringify(shared)).digest("hex");
}

/* ── Loop prevention (P8-INT-02, field-mapping §3 and §8.1 step 2) ───────── */

type Marker = { lastSyncOrigin: SyncOrigin | null; lastSyncHash: string | null };

/**
 * Should an outbound push go?
 *
 *   - `echo`: Zoho wrote this state last and our shared fields still hash to
 *     it. Pushing would send Zoho its own value back — the first half of the
 *     ping-pong. Dropped.
 *   - `unchanged`: we wrote this exact state last. Nothing to say.
 *   - `push`: the shared fields differ from whatever was last agreed.
 */
export function outboundDecision(row: Marker, hash: string): "push" | "echo" | "unchanged" {
  if (row.lastSyncHash !== hash) return "push";
  return row.lastSyncOrigin === "ZOHO" ? "echo" : "unchanged";
}

/**
 * Should an inbound record be applied? The mirror image: a notification for
 * a record whose shared fields hash to what WE last sent is Zoho telling us
 * about our own write, and is dropped.
 */
export function inboundDecision(row: Marker, hash: string): "apply" | "echo" | "unchanged" {
  if (row.lastSyncHash !== hash) return "apply";
  return row.lastSyncOrigin === "SPONSORX" ? "echo" : "unchanged";
}

/**
 * §8.1 step 3 — did the same record change on both sides since the last
 * successful sync? Only then is there a conflict for the SoR to settle.
 */
export function changedOnBothSides(
  localUpdatedAt: Date,
  zohoModifiedAt: Date | null,
  lastSyncAt: Date | null,
): boolean {
  if (!lastSyncAt || !zohoModifiedAt) return false;
  return localUpdatedAt > lastSyncAt && zohoModifiedAt > lastSyncAt;
}

/* ── Small transforms ───────────────────────────────────────────────────── */

/** Zoho rejects the whole record on overflow (§3 Field length). */
export function truncate(value: string | null | undefined, max: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.length <= max ? value : value.slice(0, max);
}

/** Cents → Zoho currency. The one place the rounding rule lives (§3 Money). */
export function centsToZoho(cents: number): number {
  return Math.round(cents) / 100;
}

export function zohoToCents(amount: unknown): number | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const BUSINESS_TZ = "America/New_York";

/**
 * A calendar date we store as a date — a brief's or campaign's start and
 * end — arrives as UTC midnight ("2026-11-30" → 2026-11-30T00:00Z). Read in
 * the business timezone that is the evening of the 29th, so a date-only
 * value is formatted in UTC: it is already the day that was meant.
 */
export function calendarDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A real instant reduced to its day in the business timezone — a task due
 * three days from now is due on the day it is in Maryland (§7.5).
 */
export function zohoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** The month of a calendar date — UTC for the same reason as calendarDate. */
function monthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "numeric" }).format(d);
}

/* ── Accounts (§7.1) ────────────────────────────────────────────────────── */

export function accountShared(name: string) {
  return { Account_Name: truncate(name, 200) ?? "" };
}

export function zohoAccountShared(r: Record<string, unknown>) {
  return accountShared(String(r.Account_Name ?? ""));
}

export function toZohoAccountCreate(s: { id: string; name: string }) {
  return {
    SponsorX_ID: s.id,
    ...accountShared(s.name),
    /* Set once at creation, never again (§7.1). */
    Account_Type: "Customer",
  };
}

/* ── Contacts (§7.2) ────────────────────────────────────────────────────── */

type ContactFields = { name: string; email: string; phone: string | null; title: string | null };

/**
 * One unsplit name string on our side. It goes whole to Last_Name and
 * First_Name stays empty — splitting on a space is a guess (§3 Names). Read
 * back, a name sales has since split is rejoined, so the two sides compare.
 */
export function contactShared(c: ContactFields) {
  return {
    name: truncate(c.name, 80) ?? "",
    Email: truncate(c.email, 100) ?? "",
    Phone: truncate(c.phone, 50) ?? null,
    Title: truncate(c.title, 100) ?? null,
  };
}

export function zohoContactShared(r: Record<string, unknown>) {
  const name = [r.First_Name, r.Last_Name].filter((p) => typeof p === "string" && p).join(" ");
  return contactShared({
    name,
    email: String(r.Email ?? ""),
    phone: (r.Phone as string | null) ?? null,
    title: (r.Title as string | null) ?? null,
  });
}

export function toZohoContactCreate(c: ContactFields & { id: string }, zohoAccountId: string) {
  const shared = contactShared(c);
  return {
    SponsorX_ID: c.id,
    Last_Name: shared.name,
    Email: shared.Email,
    ...(shared.Phone ? { Phone: shared.Phone } : {}),
    ...(shared.Title ? { Title: shared.Title } : {}),
    Account_Name: { id: zohoAccountId },
  };
}

/* ── Deals (§4.1, §7.4) ─────────────────────────────────────────────────── */

export type DealKey = `brief:${string}` | `campaign:${string}` | `renewal:${string}`;

export function dealKey(briefId: string | null, campaignId: string | null): DealKey {
  if (briefId) return `brief:${briefId}`;
  if (campaignId) return `campaign:${campaignId}`;
  throw new Error("a deal needs a brief or a campaign");
}

export function parseDealKey(key: unknown):
  | { kind: "brief" | "campaign" | "renewal"; id: string }
  | null {
  if (typeof key !== "string") return null;
  const m = key.match(/^(brief|campaign|renewal):(.+)$/);
  return m ? { kind: m[1] as "brief" | "campaign" | "renewal", id: m[2]! } : null;
}

/**
 * The Stage SponsorX asserts for its own state (§7.4's table). `null` for
 * DRAFT — no Deal exists before qualification. ACTIVE, REPORTING and
 * COMPLETED read Closed Won: once won, Stage never regresses, and delivery
 * progress does not belong in a sales pipeline.
 */
export function assertedStage(
  brief: BriefState | null,
  campaign: CampaignState | null,
): string | null {
  if (campaign) return campaign === "CANCELLED" ? "Closed Lost" : "Closed Won";
  switch (brief) {
    case "QUALIFIED":
      return "Qualification";
    case "APPROVED":
      return "Proposal/Price Quote";
    case "CAMPAIGN_CREATED":
      return "Closed Won";
    case "CLOSED":
      return "Closed Lost";
    default:
      return null;
  }
}

export function dealShared(amountCents: number, stage: string) {
  return { Amount: centsToZoho(amountCents), Stage: stage };
}

export function zohoDealShared(r: Record<string, unknown>) {
  return { Amount: Number(r.Amount ?? 0), Stage: String(r.Stage ?? "") };
}

export function dealName(sponsor: string, subject: string, when: Date): string {
  return truncate(`${sponsor} — ${subject} — ${monthYear(when)}`, 120)!;
}

export function toZohoDealCreate(d: {
  key: DealKey;
  sponsorName: string;
  subject: string;
  objective: string | null;
  amountCents: number;
  stage: string;
  startDate: Date;
  endDate: Date;
  zohoAccountId: string;
  zohoContactId: string | null;
  existingBusiness: boolean;
}) {
  return {
    SponsorX_ID: d.key,
    Deal_Name: dealName(d.sponsorName, d.subject, d.startDate),
    ...dealShared(d.amountCents, d.stage),
    Closing_Date: calendarDate(d.endDate),
    Account_Name: { id: d.zohoAccountId },
    ...(d.zohoContactId ? { Contact_Name: { id: d.zohoContactId } } : {}),
    ...(d.objective ? { Description: d.objective } : {}),
    Type: d.existingBusiness ? "Existing Business" : "New Business",
  };
}

/**
 * The update SponsorX sends for a Deal Zoho already has. Stage always —
 * a push only happens on one of our own transitions, which is exactly the
 * moment §7.4 says SponsorX asserts. Amount only once a campaign exists:
 * before that it is a negotiating number and Zoho is SoR.
 */
export function toZohoDealUpdate(d: { key: DealKey; amountCents: number; stage: string; contracted: boolean }) {
  return {
    SponsorX_ID: d.key,
    Stage: d.stage,
    ...(d.contracted ? { Amount: centsToZoho(d.amountCents) } : {}),
  };
}

/** §18 row 9. Opened at Qualification with the finished campaign's budget. */
export function toZohoRenewalCreate(r: {
  campaignId: string;
  sponsorName: string;
  budgetCents: number;
  endDate: Date;
  zohoAccountId: string;
  zohoContactId: string | null;
}) {
  return {
    SponsorX_ID: `renewal:${r.campaignId}`,
    Deal_Name: dealName(r.sponsorName, "renewal", r.endDate),
    Stage: "Qualification",
    Amount: centsToZoho(r.budgetCents),
    Type: "Existing Business",
    Account_Name: { id: r.zohoAccountId },
    ...(r.zohoContactId ? { Contact_Name: { id: r.zohoContactId } } : {}),
  };
}

/* ── Tasks (§7.5) ───────────────────────────────────────────────────────── */

type TaskFields = { subject: string; dueDate: Date; completedAt: Date | null };

export function taskShared(t: TaskFields) {
  return {
    Subject: truncate(t.subject, 255) ?? "",
    Due_Date: zohoDate(t.dueDate),
    completed: t.completedAt !== null,
  };
}

export function zohoTaskShared(r: Record<string, unknown>) {
  return {
    Subject: truncate(String(r.Subject ?? ""), 255) ?? "",
    Due_Date: String(r.Due_Date ?? ""),
    completed: r.Status === "Completed",
  };
}

export function toZohoTaskCreate(t: TaskFields & {
  id: string;
  body: string | null;
  zohoOwnerId: string | null;
  zohoDealId: string | null;
  zohoContactId: string | null;
}) {
  const shared = taskShared(t);
  return {
    SponsorX_ID: t.id,
    Subject: shared.Subject,
    Due_Date: shared.Due_Date,
    ...(t.body ? { Description: t.body } : {}),
    Status: "Not Started",
    Priority: "Normal",
    /* SponsorX sends its own notifications; Zoho emailing too would
       double-notify with copy we do not control (§7.5). */
    Send_Notification_Email: false,
    ...(t.zohoOwnerId ? { Owner: { id: t.zohoOwnerId } } : {}),
    ...(t.zohoDealId ? { What_Id: { id: t.zohoDealId }, $se_module: "Deals" } : {}),
    ...(t.zohoContactId ? { Who_Id: { id: t.zohoContactId } } : {}),
  };
}

/** Subject, due date and body are SponsorX's (→); Status is Zoho's. */
export function toZohoTaskUpdate(t: TaskFields & { id: string; body: string | null }) {
  const shared = taskShared(t);
  return {
    SponsorX_ID: t.id,
    Subject: shared.Subject,
    Due_Date: shared.Due_Date,
    ...(t.body ? { Description: t.body } : {}),
  };
}

/* ── Leads (§7.3) — one-way ─────────────────────────────────────────────── */

/** Only values the org's picklist actually has — verified 2026-09-24. */
export const LEAD_SOURCE: Record<string, string> = {
  "web-form": "OnlineStore",
  outbound: "Cold Call",
  event: "Trade Show",
};

/**
 * A fan who ticked "the sponsor may contact me" (2S6-INT-03). Zoho requires
 * Last_Name; a fan gave no name, only an address, so the lead says what it
 * is rather than inventing one. Keyed `fanlead:<claim id>` so a retried job
 * upserts the same Lead.
 */
export function toZohoFanLead(l: {
  eventId: string; email: string; sponsorName: string; campaignName: string; offerText: string; consentedAt: Date | null;
}) {
  return {
    SponsorX_ID: `fanlead:${l.eventId}`,
    Last_Name: "Fan (QR reward)",
    Company: truncate(l.sponsorName, 200),
    Email: truncate(l.email, 100),
    Lead_Source: "SponsorX QR reward",
    Description:
      `Claimed "${l.offerText}" in ${l.campaignName} and agreed that ${l.sponsorName} may contact them about offers` +
      (l.consentedAt ? ` (${l.consentedAt.toISOString().slice(0, 10)}).` : "."),
  };
}

export function toZohoLead(i: {
  id: string;
  firstName: string | null;
  lastName: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  source: string;
}) {
  return {
    SponsorX_ID: i.id,
    Last_Name: truncate(i.lastName, 80)!,
    ...(i.firstName ? { First_Name: truncate(i.firstName, 40) } : {}),
    ...(i.companyName ? { Company: truncate(i.companyName, 200) } : {}),
    Email: truncate(i.email, 100),
    ...(i.phone ? { Phone: truncate(i.phone, 30) } : {}),
    ...(i.message ? { Description: i.message } : {}),
    ...(LEAD_SOURCE[i.source] ? { Lead_Source: LEAD_SOURCE[i.source] } : {}),
  };
}
