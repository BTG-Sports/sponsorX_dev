import type { ApiDocumentCheck, ApiDocumentReturned } from "@/lib/document-checks-live";
import { isEscalated, waitingAge, type ApiHandoffRequest } from "@/lib/guardian-live";
import type { PageInfo } from "@/lib/list-query";
import { dayOf, momentOf } from "@/lib/new-signups-live";

/* --------------------------------------------------------------------------
   BTG's Guardian handoffs desk — 2S1-FE-10, BTG half (Claude Design
   GuardianHandoffs.dc.html, states HO-1…HO-9). A new guardian asks to take
   over a minor's account and the current guardian hands off. BTG has a step
   only when the tenant's "BTG staff confirm minors" setting is on: then a
   handed-off request (HANDED_OFF) waits here for Confirm the switch or
   Decline. Disputes are never decided here — they come in through support.

   LIVE since 2S1-BE-15 (BTG admin and super admin — guardianHandoff read is
   tenant-wide for them, approve is BTG's only):
     GET  /guardian-handoffs?group=…                  one tab, with every tab's count and `staff`
     GET  /guardian-handoffs/:id                      one, with `staff`
     POST /guardian-handoffs/:id/staff-decision       { decision: CONFIRM | DECLINE, note }
     GET  /guardian-handoffs/:id/documents/:docId     a 5-minute audited link
     GET  /signup-rules/settings                      { staffConfirmMinors }

   POL-FE-10 / POL-BE-10 (2026-10-29) — a handoff can no longer wait
   forever: 3 days in, the current guardian is reminded; at 7 days with no
   answer it is escalated (`escalatedAt`) and "Waiting for BTG" holds it
   too, with its count. BTG then has Confirm / Decline (`btgMayDecide`) on
   the same staff decision; the current guardian can still answer, and the
   first answer decides. The desk shows the age ("waiting 9 days") and "No
   answer from <guardian>".

   Pure: shapes, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

export type HandoffGroup = "WAITING_FOR_BTG" | "IN_PROGRESS" | "SWITCHED" | "DECLINED" | "CANCELLED";

/** What only BTG's read carries (the API's `staff` block). */
export type ApiHandoffStaff = {
  athlete: { id: string; age: number | null; sport: string };
  current: { id: string; relationship: string | null };
  newGuardian: { id: string; name: string } | null;
  requester: { email: string; phone: string | null; emailConfirmedAt: string | null; agreementVersion: string | null; agreementAcceptedAt: string | null };
  /** P8-FE-11 — `check`: what reading it found (null until read); `returned`: BTG sent it back (its file is gone). */
  documents: {
    id: string; kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF"; label: string; proof: string | null; filename: string; uploadedAt: string | null;
    check?: ApiDocumentCheck; returned?: ApiDocumentReturned;
  }[];
  /** P8-BE-11 — why the documents hold the handoff for BTG, one reason each; empty when they read clear. */
  documentHolds?: string[];
  /** When the current guardian handed off — null when they haven't (or declined). */
  handedOffAt: string | null;
  /** Who closed it: the current guardian or BTG (with the BTG login's email). */
  decision: { by: "BTG" | "CURRENT_GUARDIAN" | null; at: string | null; byEmail: string | null; note: string | null } | null;
};

export type ApiDeskHandoff = ApiHandoffRequest & { staff: ApiHandoffStaff };
export type ApiHandoffDesk = { handoffs: ApiDeskHandoff[]; counts: Record<HandoffGroup, number>; /** P1-FE-31 — present on a paged read. */ page?: PageInfo };

/** How many rows an UNPAGED read returns at most (the API's BTG cap). The desk pages (P1-FE-31), so it never meets it. */
export const DESK_PAGE = 100;

export const HANDOFF_TABS = [
  { key: "waiting", group: "WAITING_FOR_BTG", label: "Waiting for BTG", empty: ["Nothing waiting", "Nothing waiting — handoffs you need to confirm, and requests the current guardian hasn’t answered in 7 days, appear here."] },
  { key: "progress", group: "IN_PROGRESS", label: "In progress", empty: ["Nothing in progress", "Handoffs still being set up by the guardians appear here."] },
  { key: "switched", group: "SWITCHED", label: "Switched", empty: ["None switched yet", "Finished handoffs appear here as a record."] },
  { key: "declined", group: "DECLINED", label: "Declined", empty: ["Nothing declined", "Declined handoffs appear here with their reason."] },
  { key: "cancelled", group: "CANCELLED", label: "Cancelled", empty: ["Nothing cancelled", "Requests closed because the guardian changed another way first appear here."] },
] as const satisfies readonly { key: string; group: HandoffGroup; label: string; empty: readonly [string, string] }[];

export type HandoffTab = (typeof HANDOFF_TABS)[number];

/**
 * ?tab= picks a tab. Without one: Waiting for BTG — unless the setting is
 * off and nothing waits, when the desk is a record and opens on Switched.
 */
export function handoffTab(raw: string | string[] | undefined, fallback: { staffConfirmMinors: boolean | null; waiting?: number }): HandoffTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const picked = HANDOFF_TABS.find((t) => t.key === v);
  if (picked) return picked;
  const off = fallback.staffConfirmMinors === false && !fallback.waiting;
  return HANDOFF_TABS[off ? 2 : 0];
}

export type Banner = { on: boolean | null; text: string };

export function settingBanner(staffConfirmMinors: boolean | null): Banner {
  if (staffConfirmMinors === null) return { on: null, text: "The “BTG staff confirm minors” setting couldn’t be read. Requests waiting for BTG still show under Waiting for BTG." };
  return staffConfirmMinors
    ? { on: true, text: "BTG staff confirm minors is ON — handed-off requests wait for you here." }
    : { on: false, text: "BTG staff confirm minors is OFF — handoffs switch by themselves once the current guardian hands off. This desk is a record." };
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";
export type StepBadge = { label: string; tone: Tone; mark: string };

/** POL-FE-10 — BTG may confirm or decline now: the API's `btgMayDecide`; an older API only ever held HANDED_OFF for BTG. */
export const mayDecide = (h: Pick<ApiHandoffRequest, "state" | "btgMayDecide">): boolean => h.btgMayDecide ?? h.state === "HANDED_OFF";

/** "waiting 9 days" — the row's age while it is with the current guardian; null elsewhere. */
export const deskAge = (h: Pick<ApiHandoffRequest, "state" | "waitingDays" | "sentAt">, now = new Date()): string | null => waitingAge(h, now);

/** The list's "Step", in words. */
export function stepBadge(h: ApiDeskHandoff): StepBadge {
  const cur = h.current.firstName;
  const req = h.requester.firstName;
  switch (h.state) {
    case "HANDED_OFF":
      return { label: "Waiting for BTG", tone: "warn", mark: "!" };
    case "WAITING":
      /* POL-FE-10 — 7 days with no answer: it is BTG's to decide, though the current guardian still can. */
      if (isEscalated(h)) return { label: `No answer from ${cur} — your call`, tone: "warn", mark: "!" };
      return { label: `Waiting for ${cur} to answer`, tone: "primary", mark: "●" };
    case "REQUESTED":
      if (!h.idUploaded || !h.proofUploaded) return { label: `${req} is uploading documents`, tone: "primary", mark: "●" };
      if (!h.emailConfirmed) return { label: `${req} is confirming their email`, tone: "primary", mark: "●" };
      return { label: `${req} is accepting the agreement`, tone: "primary", mark: "●" };
    case "SWITCHED":
      return { label: h.switchedAt ? `Switched ${dayOf(h.switchedAt)}` : "Switched", tone: "accent", mark: "✓" };
    case "DECLINED":
      return { label: h.staff.decision?.by === "BTG" ? "Declined by BTG" : `${cur} declined`, tone: "danger", mark: "✕" };
    case "CANCELLED":
      return { label: "Closed — the guardian changed another way", tone: "neutral", mark: "✕" };
  }
}

/** The detail page's status badge — the list's words, shorter for a switch. */
export function detailBadge(h: ApiDeskHandoff): StepBadge {
  const b = stepBadge(h);
  return h.state === "SWITCHED" ? { ...b, label: "Switched" } : h.state === "CANCELLED" ? { ...b, label: "Closed" } : b;
}

export type DeskStep = { label: string; note: string; status: "done" | "current" | "todo" | "stopped" };

/**
 * The three steps BTG sees: the new guardian asked, the current guardian
 * handed off, BTG confirmed. Each tick comes from a recorded time.
 */
export function deskTrack(h: ApiDeskHandoff): DeskStep[] {
  const cur = h.current.firstName;
  const req = h.requester.firstName;
  const d = h.staff.decision;
  const at = (iso: string | null | undefined, otherwise: string) => (iso ? momentOf(iso) : otherwise);

  const asked: DeskStep = h.state === "REQUESTED"
    ? { label: `${req} is asking`, note: "Not sent yet", status: "current" }
    : { label: `${req} asked`, note: momentOf(h.requestedAt), status: "done" };

  let handed: DeskStep;
  if (h.staff.handedOffAt) handed = { label: `${cur} handed off`, note: momentOf(h.staff.handedOffAt), status: "done" };
  else if (h.state === "DECLINED") handed = { label: `${cur} declined`, note: at(d?.at, "Declined"), status: "stopped" };
  else if (h.state === "WAITING") {
    /* POL-FE-10 — escalated: no answer in 7 days; the age says how long. */
    const age = deskAge(h);
    handed = isEscalated(h)
      ? { label: `${cur} hands off`, note: `No answer${age ? ` · ${age}` : ""}`, status: "current" }
      : { label: `${cur} hands off`, note: `Waiting for ${cur}${age ? ` · ${age}` : ""}`, status: "current" };
  } else handed = { label: `${cur} hands off`, note: h.state === "CANCELLED" ? "Not needed" : "Not yet", status: "todo" };

  let btg: DeskStep;
  if (h.state === "HANDED_OFF") btg = { label: "BTG confirms", note: "Now — your turn", status: "current" };
  else if (h.state === "WAITING" && isEscalated(h)) btg = { label: "BTG decides", note: `Now — your turn, or ${cur}’s`, status: "current" };
  else if (h.state === "SWITCHED") {
    btg = d?.by === "BTG"
      ? { label: "BTG confirmed", note: at(d.at, "Done"), status: "done" }
      : { label: "Switched by itself", note: at(h.switchedAt, "Done"), status: "done" };
  } else if (h.state === "DECLINED") {
    btg = d?.by === "BTG" ? { label: "BTG declined", note: at(d.at, "Declined"), status: "stopped" } : { label: "BTG confirms", note: "Not needed", status: "todo" };
  } else if (h.state === "CANCELLED") btg = { label: "Closed", note: at(d?.at, "Closed"), status: "stopped" };
  else btg = { label: "BTG confirms", note: "Not yet", status: "todo" };

  return [asked, handed, btg];
}

/** The line under the tracker once a request is closed: who, when, and a decline's reason. */
export function outcomeOf(h: ApiDeskHandoff): { text: string; tone: "accent" | "danger" | "neutral"; quote: string | null } | null {
  const d = h.staff.decision;
  const when = d?.at ? momentOf(d.at) : "";
  if (h.state === "SWITCHED") {
    return d?.by === "BTG"
      ? { text: `Switched ${when} — confirmed by ${d.byEmail ?? "a BTG admin"}`, tone: "accent", quote: null }
      : { text: `Switched ${when} — ${h.current.firstName} handed off and it switched by itself`, tone: "accent", quote: null };
  }
  if (h.state === "DECLINED") {
    const by = d?.by === "BTG" ? d.byEmail ?? "a BTG admin" : h.current.name;
    return { text: `Declined ${when} by ${by}`, tone: "danger", quote: d?.note ?? null };
  }
  if (h.state === "CANCELLED") {
    return { text: `Closed ${when} — ${h.athlete.firstName}’s guardian changed another way first. Nothing changed because of it.`, tone: "neutral", quote: null };
  }
  return null;
}

/** "What changes when you confirm" — the four agreed points, in this request's names; a fifth once the current guardian never answered. */
export function confirmPoints(h: Pick<ApiHandoffRequest, "athlete" | "current" | "requester"> & Partial<Pick<ApiHandoffRequest, "state" | "escalatedAt">>): string[] {
  const a = h.athlete.firstName;
  const cur = h.current.firstName;
  const req = h.requester.firstName;
  return [
    `${req} becomes ${a}’s guardian and can sign in to act for ${a}.`,
    `${cur} stops being ${a}’s guardian. Any other children ${cur} looks after are not affected.`,
    /* POL-BE-01 (2026-10-28): what is not yet paid out follows the athlete to the new holder's account. */
    `Work already agreed stays as it is. Payouts already sent stay sent; anything not yet paid out goes to ${req}’s own payout account once they set it up.`,
    "All three, and BTG, are emailed.",
    /* POL-BE-10: when BTG confirms a request the guardian never answered, the emails say so — never "you handed off". */
    ...(h.state && isEscalated({ state: h.state, escalatedAt: h.escalatedAt ?? null }) ? [`${cur} never answered: the emails say BTG confirmed it, not that ${cur} handed off.`] : []),
  ];
}

/**
 * POL-FE-10 — the decision panel's words while BTG may decide: handed off
 * for BTG's check (the setting), or escalated after 7 days with no answer.
 * Null when it isn't BTG's turn.
 */
export function decisionWords(h: ApiDeskHandoff, staffConfirmMinors: boolean | null, now = new Date()): string | null {
  const cur = h.current.firstName;
  if (h.state === "HANDED_OFF") {
    return `${cur} handed off. ${staffConfirmMinors === false
      ? "BTG staff confirm minors was on when they did, so it still waits for you."
      : "BTG staff confirm minors is on, so it waits for you."}`;
  }
  if (!isEscalated(h) || !mayDecide(h)) return null;
  const age = deskAge(h, now);
  const reminded = h.remindedAt ? ` ${cur} was reminded ${dayOf(h.remindedAt)}.` : "";
  return `No answer from ${cur}${age ? ` — ${age}` : ""}.${reminded} It is yours to decide with the documents. ${cur} can still hand off or decline until you do; the first answer decides.`;
}

/** "Guardian agreement v1 accepted Oct 1, 9:02 AM", from the version the API recorded. */
export function agreementWords(version: string | null, acceptedAt: string | null): string {
  if (!acceptedAt) return "Not accepted yet";
  const v = version?.match(/\bv(\S+)/)?.[1];
  const name = v ? `Guardian agreement v${v}` : version && /draft/i.test(version) ? "Guardian agreement (draft)" : "Guardian agreement";
  return `${name} accepted ${momentOf(acceptedAt)}`;
}

/** "Birth certificate · birth-cert.pdf" — what the document is, then its file. */
export function documentSub(d: ApiHandoffStaff["documents"][number]): string {
  return [d.proof, d.filename].filter(Boolean).join(" · ");
}

/** "Carmen Reyes (parent)". */
export function withRelationship(name: string, relationship: string | null): string {
  return relationship ? `${name} (${relationship.toLowerCase()})` : name;
}

/** The API's refusal, in its own words where it gave them. */
export function deskRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a BTG admin can do that on the Guardian handoffs desk.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string" && status < 500) return e.message;
  return `${fallback} (HTTP ${status}).`;
}
