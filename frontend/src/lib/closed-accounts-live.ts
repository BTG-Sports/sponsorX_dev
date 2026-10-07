/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG half) — the Closed accounts desk (Claude Design
   ClosedAccounts.dc.html, states CA-1 … CA-9).

   The rule it serves (programme owner, 2026-10-01): a closed account's files
   are kept 30 days, then deleted. An account its owner closed comes back by
   itself inside those 30 days. An account BTG closed (rejected) can only ask,
   and BTG decides — Reinstate on the account's own page, or Decline here.

   LIVE since 2S1-BE-13 (BTG admin only — accountClosure read / approve):
     GET  /account-closures?tab=asking|btg|owner|age|deleted   one tab, with every tab's count
     GET  /account-closures/:id                                one, with where its Reinstate is
     POST /account-closures/:id/reactivation-decision          { decision: "DECLINE", note } — emailed as written

   Pure: shapes, tabs and the words the screens derive. `now` is a parameter.
   -------------------------------------------------------------------------- */
import type { PageInfo } from "@/lib/list-query";


export type ClosureKind = "ATHLETE" | "GUARDIAN" | "PROPERTY" | "SPONSOR" | "ONBOARDING" | "INQUIRY";
export type ClosureCause = "SELF" | "REJECTED" | "TERMINATED";
export type ClosureState = "CLOSED" | "REACTIVATED" | "PURGED";

/** One closure on the desk (GET /account-closures). */
export type ApiClosureRow = {
  id: string;
  standing: "CLOSED_SELF" | "CLOSED_BY_BTG" | "CLOSED_AT_AGE" | "REACTIVATED" | "EXPIRED";
  kind: ClosureKind;
  /** The first-name greeting the emails use. */
  greeting: string;
  /** The account's own name: an athlete's or guardian's legal name, an organisation's or a sponsor's. */
  name: string;
  subjectId: string;
  cause: ClosureCause;
  state: ClosureState;
  reason: string | null;
  closedAt: string;
  retainUntil: string;
  daysLeft: number;
  requestedAt: string | null;
  requestNote: string | null;
  requestDeclined: boolean;
  reactivatedAt: string | null;
  purgedAt: string | null;
  /** An application rejected before approval (ONBOARDING / INQUIRY): never an account. */
  application: boolean;
};

export type ClosureTabKey = "asking" | "btg" | "owner" | "age" | "deleted";
export type ApiClosureList = { closures: ApiClosureRow[]; counts: Record<ClosureTabKey, number>; /** P1-FE-31 — present on a paged read. */ page?: PageInfo };

/** GET /account-closures/:id. */
export type ApiClosure = ApiClosureRow & {
  contactEmail: string;
  /** The BTG login that closed it; null when the owner did, or the system. */
  closedByEmail: string | null;
  decision: "DECLINED" | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  decisionNote: string | null;
  /** The account's own page, where Reinstate is (an application's: where it was rejected). */
  subjectHref: string;
  reinstatable: boolean;
  canDecline: boolean;
};

/* ------------------------------------------------------------------ tabs */

export const CLOSED_TABS = [
  { key: "asking", label: "Asking to come back", empty: ["Nobody is asking to come back.", "Requests from accounts BTG closed appear here."] },
  { key: "btg", label: "Closed by BTG", empty: ["Nothing closed by BTG", "Accounts BTG rejects appear here."] },
  { key: "owner", label: "Closed by the owner", empty: ["Nobody closed their own account", "Owners can reactivate by themselves for 30 days."] },
  { key: "age", label: "Ended at coming of age", empty: ["None ended at coming of age", "Athletes who don’t upload an ID within 90 days of turning 18 appear here."] },
  { key: "deleted", label: "Files deleted", empty: ["No deleted files", "Accounts appear here once their 30 days are up."] },
] as const satisfies readonly { key: ClosureTabKey; label: string; empty: readonly [string, string] }[];
export type ClosedTab = (typeof CLOSED_TABS)[number];

export function closedTab(raw: string | string[] | undefined): ClosedTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return CLOSED_TABS.find((t) => t.key === v) ?? CLOSED_TABS[0];
}

/* ---------------------------------------------------------------- words */

/** "Oct 20" (UTC) */
export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sep 20, 2:10 PM" (UTC) */
export function momentOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

const KIND: Record<ClosureKind, string> = {
  ATHLETE: "Athlete", GUARDIAN: "Guardian", PROPERTY: "Organization", SPONSOR: "Sponsor",
  ONBOARDING: "Application (rejected before approval)", INQUIRY: "Application (rejected before approval)",
};
export const kindWords = (kind: ClosureKind): string => KIND[kind] ?? kind;

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";
export type Mark = { label: string; tone: Tone; mark: string };

/** "Why it closed", in words — the list's badge. */
export function whyBadge(c: Pick<ApiClosureRow, "cause" | "state" | "kind">): Mark {
  if (c.state === "PURGED") return { label: "Files deleted", tone: "neutral", mark: "✕" };
  if (c.cause === "SELF") return { label: "Closed by the owner", tone: "neutral", mark: "○" };
  if (c.cause === "TERMINATED") {
    return c.kind === "GUARDIAN"
      ? { label: "Ended with their athlete’s coming of age", tone: "warn", mark: "!" }
      : { label: "Ended — no ID within 90 days of turning 18", tone: "warn", mark: "!" };
  }
  return { label: "Rejected by BTG", tone: "danger", mark: "✕" };
}

/** The detail page's status badge: asking first, then why it closed. */
export function statusBadge(c: Pick<ApiClosureRow, "cause" | "state" | "kind" | "requestedAt" | "requestDeclined">): Mark {
  if (c.state === "REACTIVATED") return { label: "Came back", tone: "accent", mark: "✓" };
  if (c.state === "CLOSED" && c.requestedAt && !c.requestDeclined) return { label: "Asking to come back", tone: "warn", mark: "!" };
  return whyBadge(c);
}

/** "19 days left" */
export function daysLeftWords(n: number): string {
  if (n <= 0) return "deleted at the next daily clean-up";
  return `${n} day${n === 1 ? "" : "s"} left`;
}

/** The list's "Files kept until" cell. */
export function keptCell(c: Pick<ApiClosureRow, "state" | "retainUntil" | "daysLeft" | "purgedAt">): { date: string; left: string } {
  if (c.state === "PURGED") return { date: `Files deleted on ${dayOf(c.purgedAt ?? c.retainUntil)} — they would need to sign up again`, left: "" };
  if (c.state === "REACTIVATED") return { date: "—", left: "" };
  return { date: dayOf(c.retainUntil), left: daysLeftWords(c.daysLeft) };
}

/** The detail header's line: "Files kept until Oct 20 · 19 days left". */
export function keptLine(c: Pick<ApiClosureRow, "state" | "retainUntil" | "daysLeft" | "purgedAt" | "reactivatedAt">): string {
  if (c.state === "PURGED") return `Files deleted on ${dayOf(c.purgedAt ?? c.retainUntil)}.`;
  if (c.state === "REACTIVATED") return `Came back on ${dayOf(c.reactivatedAt ?? c.retainUntil)}. Nothing was deleted.`;
  return `Files kept until ${dayOf(c.retainUntil)} · ${daysLeftWords(c.daysLeft)}`;
}

/** The first card's heading. */
export function whyTitle(c: Pick<ApiClosureRow, "cause" | "application">): string {
  if (c.cause === "REJECTED") return c.application ? "Why BTG rejected the application" : "Why BTG closed it";
  return "Why it closed";
}

/** Who closed it, and when. */
export function byLine(c: Pick<ApiClosure, "cause" | "application" | "name" | "closedAt" | "closedByEmail">): string {
  if (c.cause === "SELF") return `Closed by ${c.name} from Settings · ${momentOf(c.closedAt)}`;
  if (c.cause === "TERMINATED") return `Ended automatically · ${dayOf(c.closedAt)}`;
  return `${c.application ? "Rejected" : "Closed"} by ${c.closedByEmail ?? "BTG"} · ${momentOf(c.closedAt)}`;
}

/** "Asked Sep 28, 4:15 PM · from dana@…" */
export function askedLine(c: Pick<ApiClosure, "requestedAt" | "contactEmail">): string {
  if (!c.requestedAt) return "";
  return `Asked ${momentOf(c.requestedAt)}${c.contactEmail ? ` · from ${c.contactEmail}` : ""}`;
}

/** The sentence that replaces the actions when there is nothing for BTG to do. */
export function readOnlyLine(c: Pick<ApiClosure, "cause" | "state" | "kind" | "greeting" | "standing" | "retainUntil" | "purgedAt" | "reactivatedAt">): string | null {
  if (c.state === "PURGED") return `Files deleted on ${dayOf(c.purgedAt ?? c.retainUntil)}. To come back they need to sign up again.`;
  if (c.state === "REACTIVATED") return `${c.greeting} came back on ${dayOf(c.reactivatedAt ?? c.retainUntil)}. Nothing for you to do.`;
  if (c.standing === "EXPIRED") return "The 30 days are up — their files are deleted at the next daily clean-up. To come back they need to sign up again.";
  if (c.cause === "SELF") return `${c.greeting} can reactivate by themselves until ${dayOf(c.retainUntil)} using the link we emailed. Nothing for you to do.`;
  if (c.cause === "TERMINATED") {
    return c.kind === "GUARDIAN"
      ? "This guardian account ended with their athlete’s coming-of-age allowance. Nothing for you to do."
      : `${c.greeting} can bring the account back by uploading a government ID until ${dayOf(c.retainUntil)}, using the link we emailed. Nothing for you to do.`;
  }
  return null;
}

export type HistoryLine = { at: string; text: string; tone: "text" | "warn" | "faint" };

/** Closed → asked to come back → declined / came back → files deleted, from the closure's own dates. */
export function historyOf(c: ApiClosure): HistoryLine[] {
  const out: HistoryLine[] = [];
  const closed =
    c.cause === "SELF" ? "Closed by the owner"
    : c.cause === "TERMINATED" ? (c.kind === "GUARDIAN" ? "Ended with their athlete’s coming of age" : "Ended: no ID uploaded in time")
    : c.application ? "Application rejected by BTG" : "Closed by BTG";
  out.push({ at: momentOf(c.closedAt), text: closed, tone: "text" });
  if (c.requestedAt) out.push({ at: momentOf(c.requestedAt), text: "Asked to come back", tone: "warn" });
  if (c.decision === "DECLINED" && c.decidedAt) {
    out.push({ at: momentOf(c.decidedAt), text: `Declined${c.decidedByEmail ? ` by ${c.decidedByEmail}` : ""}${c.decisionNote ? `: “${c.decisionNote}”` : ""}`, tone: "text" });
  }
  if (c.reactivatedAt) out.push({ at: momentOf(c.reactivatedAt), text: "Came back", tone: "text" });
  if (c.state === "PURGED") out.push({ at: dayOf(c.purgedAt ?? c.retainUntil), text: "Files deleted", tone: "text" });
  if (c.state === "CLOSED") {
    if (c.canDecline && c.reinstatable) out.push({ at: "—", text: "Declined or reinstated: not yet", tone: "faint" });
    if (c.cause === "SELF") out.push({ at: dayOf(c.retainUntil), text: "Files deleted if not reactivated", tone: "faint" });
    else if (c.cause === "TERMINATED" && c.kind !== "GUARDIAN") out.push({ at: dayOf(c.retainUntil), text: "Files deleted if no ID is uploaded", tone: "faint" });
    else out.push({ at: dayOf(c.retainUntil), text: c.application ? "Files deleted" : "Files deleted if not reinstated", tone: "faint" });
  }
  return out;
}

/** "Bay Brewing’s", "Laurel Lions’" */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** The suggested wording of "Tell them to apply again". */
export const APPLY_AGAIN_TEXT = "This was an application, so you can apply again any time. Please include what was missing last time.";

/** BTG's words for a refused write, from the API's error body. */
export function deskRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a BTG admin can answer requests to come back.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
