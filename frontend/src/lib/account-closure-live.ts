import { RETENTION_DAYS, dayOf } from "@/lib/account-live";

/* --------------------------------------------------------------------------
   2S1-FE-08 (close / reactivate half) — closing an account and the public
   reactivation page, as the API answers them (2S1-BE-13).

     POST /me/close                               the settings page's Close account
     GET  /me/close/preview?account=              what closing would affect, before confirming (POL-BE-11)
     POST /me/close/withdraw                      take back a closure held for BTG (POL-BE-11)
     GET  /public/account/reactivation/:token     where a closed account stands
     POST /public/account/reactivation/:token     REACTIVATE (self-closed) | REQUEST (closed by BTG)
     POST /public/account/reactivation-link       a fresh link by email

   POL-FE-11 (2026-10-29): closing no longer ignores live deals. Before the
   owner confirms, the preview says what closing would affect — the live
   deals, the open invitations, the money earned, a guardian's minors — and
   whether BTG has to settle those first (`wouldHold`). Held, the account
   stays open and the row says "Waiting for BTG" with Withdraw. A minor's
   own login is told their guardian closes it (403 guardian_must_act).

   Pure: the shapes and every word the screens derive. `now` is a parameter.
   The samples exist only for the ?demo= previews, which say they are
   previews and never call the API.
   -------------------------------------------------------------------------- */

/* ═══════════════════════ POL-FE-11 · before closing ═══════════════════════ */

export type ClosingAccount = "ATHLETE" | "GUARDIAN" | "PROPERTY";

/** One deal closing would leave behind (GET /me/close/preview, POST /me/close 202, GET /account-closure-requests/:id `now`). */
export type ApiLiveDeal = {
  kind: "CAMPAIGN_ORDER" | "MARKETPLACE_SALE";
  id: string;
  title: string;
  /** A campaign order: SENT · ACCEPTED · ACTIVE. A marketplace sale: UNPAID · IN_DELIVERY · DELIVERED · PROBLEM. */
  state: string;
  sponsorId: string;
  sponsorName: string;
  /** Whose deal — for a guardian, which of their minors. */
  athleteName: string | null;
};

/** What closing would affect — the preview, and BTG's `now` on a held request. */
export type ApiClosureImpact = {
  liveDeals: ApiLiveDeal[];
  /** Closing declines them. */
  openInvitations: number;
  /** A guardian's minors still in their care. */
  wards: { id: string; name: string }[];
  /** Earned and not yet paid out; null for a guardian (no money of their own). */
  money: { owedCents: number; accountReady: boolean } | null;
  /** Why it can't close yet, in the API's words. Empty: it closes now. */
  holdReasons: string[];
};

export type ClosureRequestState = "HELD" | "CLOSED" | "DECLINED" | "WITHDRAWN";

/** A closure held for BTG, as the preview's `heldRequest` and the desk list carry it. */
export type ApiClosureRequest = {
  id: string;
  account: ClosingAccount;
  subjectId: string;
  state: ClosureRequestState;
  /** The owner's reason for closing, if they gave one. */
  reason: string | null;
  holdReasons: string[];
  requestedAt: string;
  decidedAt: string | null;
  declineNote: string | null;
  closureId: string | null;
};

/** GET /me/close/preview. */
export type ApiClosurePreview = ApiClosureImpact & {
  account: ClosingAccount;
  wouldHold: boolean;
  heldRequest: ApiClosureRequest | null;
};

/** POST /me/close, 202: held for BTG — nothing is switched off. */
export type ApiClosureHeld = {
  state: "HELD";
  requestId: string;
  account: ClosingAccount;
  holdReasons: string[];
  liveDeals: ApiLiveDeal[];
  createdAt: string;
};

export const GUARDIAN_MUST_ACT = "guardian_must_act";

/** "$1,250.00" */
export const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DEAL_STATE: Record<string, string> = {
  SENT: "sent, not yet answered", ACCEPTED: "accepted", ACTIVE: "under way",
  UNPAID: "sold, not yet paid", IN_DELIVERY: "in delivery", DELIVERED: "delivered, not yet confirmed", PROBLEM: "a problem was reported",
};

/** A live deal's state in words — "under way", "delivered, not yet confirmed". */
export function dealStateWords(state: string): string {
  return DEAL_STATE[state] ?? state.toLowerCase().replace(/_/g, " ");
}

export type LiveDealLine = { id: string; title: string; sponsor: string; state: string; /** "for Mia" — a guardian's minor's deal, or an organisation's athlete's. */ who: string | null };

/** One deal as a row: the title, the sponsor, its state, and whose when it isn't the closer's own. */
export function liveDealLine(d: ApiLiveDeal, account: ClosingAccount): LiveDealLine {
  return {
    id: d.id,
    title: d.title || (d.kind === "CAMPAIGN_ORDER" ? "Campaign order" : "Marketplace sale"),
    sponsor: d.sponsorName || "a sponsor",
    state: dealStateWords(d.state),
    who: account !== "ATHLETE" && d.athleteName ? `for ${d.athleteName}` : null,
  };
}

/** "2 open invitations are declined" — what closing does to the offers it can no longer answer. */
export function invitationsLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 open invitation is declined." : `${n} open invitations are declined.`;
}

/** The money line: paid to the account on file without a login, or held because there is none. */
export function moneyLine(money: ApiClosureImpact["money"]): string | null {
  if (!money || money.owedCents <= 0) return null;
  return money.accountReady
    ? `${usd(money.owedCents)} you’ve earned is still paid to your payout account on file — no login needed.`
    : `${usd(money.owedCents)} you’ve earned has no payout account to go to.`;
}

/** "You’re still the guardian for Mia and Leo." */
export function wardsLine(wards: ApiClosureImpact["wards"]): string | null {
  if (!wards.length) return null;
  const names = wards.map((w) => w.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `You’re still the guardian for ${list}.`;
}

export type ClosePreviewView = {
  title: string;
  deals: LiveDealLine[];
  /** The lines under the deals: invitations, money, wards — each only when it applies. */
  lines: string[];
  /** Held: BTG settles these first; null when it closes now. */
  hold: { title: string; reasons: string[]; stays: string } | null;
  /** The confirm button. */
  confirm: string;
  busy: string;
};

/** The confirm dialog, from the preview. `whose` names the account when it isn't "your" (a guardian closing their minor's). */
export function closePreviewView(p: ApiClosurePreview, whose?: string): ClosePreviewView {
  const own = !whose;
  const lines = [invitationsLine(p.openInvitations), moneyLine(p.money), wardsLine(p.wards)].filter((x): x is string => Boolean(x));
  const held = p.wouldHold;
  return {
    title: own ? "Close your account?" : `Close ${possessive(whose)} account?`,
    deals: p.liveDeals.map((d) => liveDealLine(d, p.account)),
    lines: own ? lines : lines.map((l) => l.replace(/^You’re /, `${whose}’s guardian is `).replace("you’ve earned", `${whose} earned`).replace("your payout account", "the payout account")),
    hold: held
      ? {
        title: "BTG settles these first",
        reasons: p.holdReasons,
        stays: `${own ? "Your" : `${possessive(whose)}`} account stays open until then — nothing is switched off. You can withdraw the request any time.`,
      }
      : null,
    confirm: held ? "Ask BTG to close it" : "Close account",
    busy: held ? "Sending…" : "Closing…",
  };
}

export type HeldView = { title: string; since: string; reasons: string[]; body: string };

/** The row (and the dialog, right after a 202) while a closure waits for BTG. */
export function heldView(r: Pick<ApiClosureRequest, "requestedAt" | "holdReasons">, whose?: string): HeldView {
  return {
    title: "Waiting for BTG",
    since: `You asked on ${dayOf(r.requestedAt)}.`,
    reasons: r.holdReasons,
    body: `${whose ? `${possessive(whose)}` : "Your"} account stays open until BTG has settled these. Withdraw the request to keep it open for good.`,
  };
}

/** A minor's own login (403 guardian_must_act): the guardian closes it. */
export const GUARDIAN_CLOSES = "Your guardian closes your account";
export function guardianClosesLine(guardianName: string | null): string {
  return `${guardianName ?? "Your guardian"} does this from their own login, while acting for you — the same way they accept your deals. Ask them when you’re ready.`;
}

/** "Mia’s", "Hawks’" */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** What the close row shows, from how the preview answered. */
export type ClosePanel =
  /** Readable: the dialog shows it before confirming. */
  | { kind: "ready"; preview: ApiClosurePreview }
  /** Already with BTG (the preview's heldRequest). */
  | { kind: "held"; request: ApiClosureRequest }
  /** A minor's own login. */
  | { kind: "minor"; guardianName: string | null }
  /** The preview couldn't be read (a BTG preview of the page, an outage): the dialog still asks, the API decides. */
  | { kind: "unknown"; note: string };

export function closePanel(status: number, body: unknown, guardianName: string | null = null): ClosePanel {
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (status === 403 && err?.code === GUARDIAN_MUST_ACT) return { kind: "minor", guardianName };
  if (status >= 200 && status < 300 && body && typeof body === "object") {
    const p = body as ApiClosurePreview;
    if (p.heldRequest && p.heldRequest.state === "HELD") return { kind: "held", request: p.heldRequest };
    return { kind: "ready", preview: p };
  }
  return { kind: "unknown", note: "We couldn’t check what closing would affect just now. If anything is still live, BTG settles it first and you’ll see that here." };
}

/** CLOSED_AT_AGE — ended at coming of age: the athlete's government ID brings it back, not BTG. */
export type ReactivationStanding = "CLOSED_SELF" | "CLOSED_BY_BTG" | "CLOSED_AT_AGE" | "REACTIVATED" | "EXPIRED";

/** GET /public/account/reactivation/:token. */
export type ApiReactivationStatus = {
  standing: ReactivationStanding;
  /** ONBOARDING / INQUIRY: an organisation's application or a sponsor's request rejected before approval (2S1-BE-13). */
  kind: "ATHLETE" | "GUARDIAN" | "PROPERTY" | "SPONSOR" | "ONBOARDING" | "INQUIRY";
  /** A first name, or the organization's name. */
  greeting: string;
  closedAt: string;
  retainUntil: string;
  daysLeft: number;
  requestedAt: string | null;
  requestDeclined: boolean;
  reactivatedAt: string | null;
  recheckNotes: string[];
  /** Where this account signs in again. */
  portalPath: string;
  supportEmail: string;
  /** CLOSED_AT_AGE, the athlete's own account: the coming-of-age page where their government ID brings it back. */
  comingOfAgePath?: string | null;
};

export type ReactivateView =
  | { kind: "self"; badge: string; headline: string; left: string; body: string }
  | { kind: "btg"; badge: string; headline: string; body: string; kept: string; asked: string | null }
  | { kind: "age"; badge: string; headline: string; body: string; kept: string; uploadPath: string | null }
  | { kind: "back"; badge: string; headline: string; notes: string[] }
  | { kind: "expired"; badge: string; headline: string; body: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function reactivateView(s: ApiReactivationStatus): ReactivateView {
  const closed = new Date(s.closedAt);
  const until = new Date(s.retainUntil);
  switch (s.standing) {
    case "REACTIVATED":
      return { kind: "back", badge: "Active again", headline: `${s.greeting}, your account is back.`, notes: s.recheckNotes };
    case "EXPIRED":
      return {
        kind: "expired",
        badge: "Closed",
        headline: `The ${RETENTION_DAYS} days have passed`,
        body: "Your documents have been deleted. To come back, sign up again.",
      };
    case "CLOSED_AT_AGE":
      /* Ended at coming of age: no Reactivate and no "ask BTG" — the
         athlete's government ID, within the 30 days, brings it back. */
      return {
        kind: "age",
        badge: "Ended at coming of age",
        headline: s.kind === "GUARDIAN"
          ? `${s.greeting}, this guardian account ended when your athlete came of age.`
          : `${s.greeting}, your account ended because no government ID came in within the 90 days.`,
        body: s.kind === "GUARDIAN"
          ? `There’s nothing to reactivate here. Your athlete can bring their own account back by uploading their government ID by ${dayOf(until)}, from the coming-of-age link we emailed them — BTG doesn’t need to review it.`
          : s.comingOfAgePath
            ? `Upload your government ID by ${dayOf(until)} and your account comes back — no need to ask BTG.`
            : `Upload your government ID by ${dayOf(until)} from the coming-of-age link we emailed you, and your account comes back — no need to ask BTG.`,
        kept: `Your documents are kept until ${dayOf(until)}, then deleted.`,
        uploadPath: s.kind === "GUARDIAN" ? null : s.comingOfAgePath ?? null,
      };
    case "CLOSED_BY_BTG":
      return {
        kind: "btg",
        badge: "Closed by BTG",
        headline: "Your account was closed by BTG — ask BTG to review it.",
        body: "You can’t reactivate it yourself. The reason was in the email BTG sent you. If you think it’s wrong, tell us and a person will look again.",
        kept: `Your documents are kept until ${dayOf(until)}, then deleted.`,
        asked: s.requestedAt
          ? s.requestDeclined
            ? `BTG looked again and replied by email on ${dayOf(s.requestedAt)}. You can ask once more if you have something new.`
            : `You asked BTG on ${dayOf(s.requestedAt)}. A person at BTG will reply by email.`
          : null,
      };
    default:
      return {
        kind: "self",
        badge: "Closed · you can reactivate",
        headline: `${s.greeting}, your account closed on ${dayOf(closed)}.`,
        left: `${plural(s.daysLeft, "day")} left`,
        body: `Reactivate by ${dayOf(until)} and everything comes back: your profile, your items and your documents. After that, your documents are deleted.`,
      };
  }
}

/* ---------------------------------------------------------------- previews */

const DAY = 86_400_000;

/** ?demo=self | btg — closed 7 days ago ("23 days left", as the design shows). */
export function sampleReactivation(standing: "CLOSED_SELF" | "CLOSED_BY_BTG", greeting: string, now = new Date()): ApiReactivationStatus {
  const closedAt = new Date(now.getTime() - 7 * DAY);
  return {
    standing, kind: "ATHLETE", greeting, closedAt: closedAt.toISOString(), retainUntil: new Date(closedAt.getTime() + RETENTION_DAYS * DAY).toISOString(),
    daysLeft: RETENTION_DAYS - 7, requestedAt: null, requestDeclined: false, reactivatedAt: null, recheckNotes: [], portalPath: "/athlete",
    supportEmail: "support@sponsorx.net",
  };
}

export function reactivateDemo(raw: string | string[] | undefined): "self" | "btg" | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "self" || v === "btg" ? v : null;
}

export const PREVIEW_ONLY = "Preview — nothing here is sent.";
