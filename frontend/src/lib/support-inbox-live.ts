/* --------------------------------------------------------------------------
   POL-FE-41 — BTG's support inbox (/admin/support) and what the message
   page adds to 2S1-FE-14's (/admin/support/[id]). BTG admin (own tenant)
   and SUPER_ADMIN.

     GET  /support-messages?status=NEW|ANSWERED|CLOSED&case=&topic=&page&size
                                               one tab's page, every tab's count
     GET  /support-messages/:id                + status, replies, cases, account, sender
     POST /support-messages/:id/replies {body} kept, emailed from noreply@ → ANSWERED
     POST /support-messages/:id/close          "Mark closed"

   The menu's count is counts.NEW (supportNavCount). The problem tags
   (POL-BE-42's `problems`) are shared with POL-FE-42 — PROBLEM_TAG.

   Pure: shapes and the words the pages derive.
   -------------------------------------------------------------------------- */

import type { ApiSupportMessage } from "@/lib/support-message-live";

export const SUPPORT_PATH = "/admin/support";

export type SupportStatus = "NEW" | "ANSWERED" | "CLOSED";

export type SupportTab = { key: "new" | "answered" | "closed"; status: SupportStatus; label: string };
export const SUPPORT_TABS: readonly SupportTab[] = [
  { key: "new", status: "NEW", label: "New" },
  { key: "answered", status: "ANSWERED", label: "Answered" },
  { key: "closed", status: "CLOSED", label: "Closed" },
];

/** ?tab= → its tab; anything else is New. */
export function supportTab(v: string | string[] | undefined): SupportTab {
  const k = Array.isArray(v) ? v[0] : v;
  return SUPPORT_TABS.find((t) => t.key === k) ?? SUPPORT_TABS[0]!;
}

/* The help desk's topics (POL-BE-43), in the form's order. */
export const SUPPORT_TOPICS: readonly { key: string; label: string }[] = [
  { key: "ACCOUNT", label: "Account" },
  { key: "PAYMENT", label: "Payment" },
  { key: "GUARDIANSHIP", label: "Guardianship" },
  { key: "CAMPAIGNS", label: "Campaigns" },
  { key: "SHOP", label: "Shop" },
  { key: "REWARDS", label: "Rewards" },
  { key: "NEXT", label: "NEXT" },
  { key: "OTHER", label: "Other" },
];

/** ?topic= kept only when it is one of the eight. */
export function topicParam(v: string | string[] | undefined): string {
  const k = (Array.isArray(v) ? v[0] : v) ?? "";
  return SUPPORT_TOPICS.some((t) => t.key === k) ? k : "";
}

/** ?case= kept only when it is shaped like a case ID (ACC-30), upper-cased. */
export function caseParam(v: string | string[] | undefined): string {
  const k = ((Array.isArray(v) ? v[0] : v) ?? "").trim().toUpperCase();
  return /^[A-Z]{3}-\d{2}$/.test(k) ? k : "";
}

/** A ticked case as the API labels it: today's words, or retired. */
export type ApiSupportCase = { id: string; topic: string | null; text: string | null; retired: boolean };

export type ApiSupportRow = {
  id: string;
  name: string;
  email: string;
  topic: string;
  topicLabel: string;
  cases: ApiSupportCase[];
  signedIn: boolean;
  status: SupportStatus;
  createdAt: string;
  answeredAt: string | null;
  closedAt: string | null;
  attachments: number;
  replies: number;
};

export type ApiSupportInbox = {
  messages: ApiSupportRow[];
  counts: Record<SupportStatus, number>;
  page?: { page: number; size: number; total: number; pages: number };
};

/* POL-BE-42 — a held record's problem. */
export type ProblemType = "UPLOAD_MISMATCH" | "COULDNT_READ" | "MISSING" | "EMAIL_NOT_CONFIRMED" | "ALREADY_REGISTERED" | "TECHNICAL_DECISION";
export type ApiProblem = { code: string; type: ProblemType | string; label: string; document: string | null; field: string | null };

/**
 * Each problem type's tag: its words and colour. Red: the upload doesn't
 * match; amber: something missing or unconfirmed; grey: couldn't read;
 * blue: already registered; purple-ish accent: a BTG rule a person decides.
 */
export const PROBLEM_TAG: Record<ProblemType, { word: string; tone: "danger" | "warn" | "neutral" | "primary" | "accent" }> = {
  UPLOAD_MISMATCH: { word: "Upload doesn't match", tone: "danger" },
  COULDNT_READ: { word: "Couldn't read", tone: "neutral" },
  MISSING: { word: "Missing", tone: "warn" },
  EMAIL_NOT_CONFIRMED: { word: "Email not confirmed", tone: "warn" },
  ALREADY_REGISTERED: { word: "Already registered", tone: "primary" },
  TECHNICAL_DECISION: { word: "Technical Decision", tone: "accent" },
};

/** A type this page doesn't know yet still shows, in grey, under its own name. */
export function problemTag(type: string): { word: string; tone: "danger" | "warn" | "neutral" | "primary" | "accent" } {
  return PROBLEM_TAG[type as ProblemType] ?? { word: type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), tone: "neutral" };
}

export type ApiSenderRecord = {
  kind: "ATHLETE" | "SPONSOR_REQUEST" | "ORGANISATION" | "GUARDIAN" | "STUDENT" | string;
  relation: "SELF" | "WARD";
  id: string;
  label: string;
  state: string;
  held: boolean;
  reasons: string[];
  problems: ApiProblem[];
  emailConfirmed: boolean;
  adminPath: string | null;
  createdAt: string | null;
};

export type ApiSupportReply = { id: string; body: string; authorId: string | null; createdAt: string };

export type ApiSupportThread = ApiSupportMessage & {
  status: SupportStatus;
  answeredAt: string | null;
  closedAt: string | null;
  closedById: string | null;
  cases: ApiSupportCase[];
  account: { id: string; email: string; roles: string[] } | null;
  replies: ApiSupportReply[];
  sender: { records: ApiSenderRecord[]; held: number };
};

/** The status badge on the inbox and the message. */
export function statusBadge(s: SupportStatus | string): { label: string; tone: "warn" | "accent" | "neutral" } {
  if (s === "NEW") return { label: "New", tone: "warn" };
  if (s === "ANSWERED") return { label: "Answered", tone: "accent" };
  if (s === "CLOSED") return { label: "Closed", tone: "neutral" };
  return { label: s, tone: "neutral" };
}

/** What each kind of record is called on the "This person on SponsorX" card. */
export function recordKind(r: Pick<ApiSenderRecord, "kind" | "relation">): string {
  const base: Record<string, string> = {
    ATHLETE: "Athlete sign-up", SPONSOR_REQUEST: "Sponsor request", ORGANISATION: "Organisation", GUARDIAN: "Guardian account", STUDENT: "NEXT student",
  };
  const word = base[r.kind] ?? r.kind;
  return r.relation === "WARD" ? "Athlete they look after" : word;
}

/** The words on an inbox row's cases column: the first case and how many more. */
export function casesSummary(cases: readonly ApiSupportCase[]): string {
  if (!cases.length) return "—";
  const first = cases[0]!;
  const words = first.retired ? `${first.id} (retired)` : `${first.id} · ${first.text}`;
  return cases.length === 1 ? words : `${words} +${cases.length - 1} more`;
}

/** The empty tab's title. */
export function emptyInboxTitle(status: SupportStatus, filtered: boolean): string {
  if (filtered) return "No messages match this filter";
  if (status === "NEW") return "No new support messages";
  if (status === "ANSWERED") return "No answered messages waiting to be closed";
  return "No closed messages yet";
}

export const MAX_REPLY = 5000;

/** Why a reply can't be sent yet, or null. */
export function replyProblem(body: string): string | null {
  const t = body.trim();
  if (!t) return "Write your reply first.";
  if (t.length > MAX_REPLY) return `Keep the reply under ${MAX_REPLY.toLocaleString("en-US")} characters (it is ${t.length.toLocaleString("en-US")}).`;
  return null;
}

/** BTG's words for a refused reply or close, from the API's error body. */
export function supportWriteRefusal(status: number, body: unknown): string {
  if (status === 403) return "This message isn't in your books — only BTG admins answer support.";
  const e = (body as { error?: { message?: unknown } } | null)?.error;
  if (typeof e?.message === "string") return e.message;
  if (status === 409) return "This message is still waiting for its files — try again in a minute.";
  return `SponsorX couldn't save that (HTTP ${status}). Nothing was sent.`;
}

/** The menu's number for Support: counts.NEW from the inbox's answer, or null when unreadable. */
export function supportNavCount(body: unknown): number | null {
  const n = (body as { counts?: { NEW?: unknown } } | null)?.counts?.NEW;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}
