/* --------------------------------------------------------------------------
   Deal Chat — 2S4-FE-07 (the sponsor's side), 2S4-FE-08 (the seller's, the
   guardian's and the team manager's) and 2S4-FE-09 (BTG's view).
   Feature spec: documentation/SponsorX-Deal-Chat-Feature.md.

   This file is network-free: the shapes GET /deal-chats and /deal-agreements
   answer with (backend/src/contracts/deal-chat.ts, deal-agreement.ts), and
   every word and decision the chat screens draw from them — the thread, the
   checklist, the offers' buttons, the final amount, where the deal stands.
   The server reads are server/deal-chat.ts; the writes server/deal-chat-actions.ts.

   Nothing here decides what a person MAY do: the API refuses (a minor's
   accept, an analyst's message, a second pick on an agreed card). These
   helpers only choose which buttons are worth showing.
   -------------------------------------------------------------------------- */

export type DealSide = "SPONSOR" | "SELLER";
export type DealTurn = DealSide | "BTG";

export type ApiDealCard = {
  key: string;
  question: string;
  multi: boolean;
  answers: { value: string; label: string }[];
  sponsor: string[] | null;
  seller: string[] | null;
  agreed: boolean;
};

export type ApiDealStatus = {
  cards: ApiDealCard[];
  agreedCount: number;
  cardCount: number;
  amount: { originalCents: number; sponsorCents: number | null; sellerCents: number | null; agreed: boolean; agreedCents: number | null };
  openExchanges: { id: string; cardKey: string | null; waitingOn: DealTurn | null }[];
  heldForBtg: number;
  allGreen: boolean;
  notYet: string[];
  turn: DealTurn[];
  moneyFigures: string[];
};

export type ApiDealExchange = {
  id: string;
  cardKey: string | null;
  state: "OPEN" | "AGREED" | "DECLINED";
  startedBy: DealSide;
  latestMessageId: string | null;
  sponsorAccepted: boolean;
  sellerAccepted: boolean;
};

export type ApiDealMessage = {
  id: string;
  kind: "TEXT" | "OFFER" | "REPLY";
  side: DealSide;
  exchangeId: string | null;
  body: string;
  createdAt: string;
  byGuardian: boolean;
  /** VISIBLE, or — to its sender and BTG only — HELD or KEPT_BACK. */
  state: "VISIBLE" | "HELD" | "KEPT_BACK";
  keptBackReason: string | null;
  /** BTG only. */
  heldReasons?: string[];
  reported?: boolean;
  reportReason?: string | null;
};

export type ApiDealChat = {
  id: string;
  orderId: string;
  orderRef: string;
  state: "OPEN" | "CLOSED";
  forms: string[];
  lineIds: string[];
  sponsorName: string;
  sellerName: string;
  /** The caller's side; null for BTG. */
  yourSide: DealSide | null;
  /** May the caller accept an offer, confirm the amount, sign or call off: false for a minor without their guardian, the sponsor's analyst and BTG. */
  mayAccept: boolean;
  unread: number;
  status: ApiDealStatus;
  moneyNudge: string | null;
  agreement: { id: string; downloadPath: string } | null;
  orderState: string;
  signingDeadline: string | null;
  calledOff: { side: DealSide; reason: string; at: string } | null;
  exchanges: ApiDealExchange[];
  messages: ApiDealMessage[];
  createdAt: string;
  lastActionAt: string;
};

export type ApiDealChatSummary = {
  id: string;
  orderId: string;
  orderRef: string;
  state: "OPEN" | "CLOSED";
  forms: string[];
  dealAgreementId: string | null;
  unread: number;
  lastActionAt: string;
  createdAt: string;
};

export type ApiDealAgreement = {
  id: string;
  orderId: string;
  orderRef: string;
  state: "OPEN" | "SIGNED" | "WITHDRAWN";
  version: number;
  forms: string[];
  lineIds: string[];
  amountCents: number;
  originalAmountCents: number;
  sponsorSignedAt: string | null;
  sellerSignedAt: string | null;
  signedByGuardian: boolean;
  signedAt: string | null;
  body: string;
  bodyHash: string;
  downloadPath: string;
  createdAt: string;
};

/** The agreement as an order card or an item card carries it (`dealAgreements[]`, `dealAgreement`). */
export type ApiDealAgreementSummary = {
  id: string;
  state: "OPEN" | "SIGNED" | "WITHDRAWN";
  forms: string[];
  amountCents: number;
  signedAt: string | null;
  sponsorSigned: boolean;
  sellerSigned: boolean;
  downloadPath: string;
};

export type ApiDealReviewItem = {
  messageId: string;
  chatId: string;
  orderId: string;
  orderRef: string;
  kind: "TEXT" | "OFFER" | "REPLY";
  side: DealSide;
  body: string;
  createdAt: string;
  state: "VISIBLE" | "HELD";
  heldReasons: string[];
  reported: boolean;
  reportReason: string | null;
  reportedAt: string | null;
};

/** Who is looking: which portal the chat is drawn in, and whether a guardian is acting for a minor. */
export type DealViewer = {
  portal: "sponsor" | "athlete" | "property" | "admin";
  /** A guardian acting for their minor (the athlete portal with a ward chosen). */
  guardian: boolean;
};

/** The longest message the API takes (deal-chat-rules.ts DEAL_CHAT_TEXT_MAX). */
export const DEAL_TEXT_MAX = 4000;
/** How often an open chat asks for news; spec §9: no sockets, "the chat refreshes every few seconds". */
export const DEAL_POLL_MS = 4000;
/** How often the list of chats asks for news while nothing is open. */
export const DEAL_LIST_POLL_MS = 20000;
/** With the live socket up the open chat is told when to read again, so its own asking drops to a safety net. */
export const DEAL_LIVE_POLL_MS = 30000;

/** How long the open chat waits before asking again: seconds without the socket, a long beat with it. */
export function chatPollDelay(socketLive: boolean): number {
  return socketLive ? DEAL_LIVE_POLL_MS : DEAL_POLL_MS;
}

/**
 * The address a BROWSER reaches the API's live socket at. API_URL is the
 * private address the web server uses and is never handed out; the public one
 * is API_PUBLIC_URL, set on the web service (documentation/SponsorX-Switches.md).
 * Unset, only a local run has one: there API_URL is this machine's own.
 * Null: no socket for the browser to open, and the chat keeps asking on its beat.
 */
export function dealSocketUrl(env: Record<string, string | undefined>): string | null {
  const trim = (u: string) => u.replace(/\/+$/, "");
  const pub = env.API_PUBLIC_URL?.trim();
  if (pub) return /^https?:\/\/[^\s/]+/.test(pub) ? trim(pub) : null;
  const local = env.API_URL ?? "http://localhost:4000";
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(local) ? trim(local) : null;
}

/* ------------------------------------------------------------------ words */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$1,150" — and "$1,150.50" only when there are cents. */
export function dealUsd(cents: number): string {
  return cents % 100 === 0 ? USD_WHOLE.format(cents / 100) : USD.format(cents / 100);
}

/** What someone typed in the amount box, in cents: "1,150", "$1150.5", "1150.50". Null when it isn't an amount. */
export function centsFromInput(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents >= 1 && cents <= 100_000_000 ? cents : null;
}

/** The amount box's own text for a number of cents: "1150" or "1150.50". */
export function inputFromCents(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Two letters for the round picture: "Under Armour" → UA, "Dana" → DA. */
export function dealInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!;
  const last = words.length > 1 ? words[words.length - 1]! : "";
  return ((first[0] ?? "") + (last ? (last[0] ?? "") : (first[1] ?? ""))).toUpperCase();
}

/** A steady hue for a name's round picture (0–359), so one person keeps one colour. */
export function dealHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export const otherSide = (side: DealSide): DealSide => (side === "SPONSOR" ? "SELLER" : "SPONSOR");

/** The name on a side of the chat. */
export function sideName(chat: Pick<ApiDealChat, "sponsorName" | "sellerName">, side: DealSide): string {
  return side === "SPONSOR" ? chat.sponsorName : chat.sellerName;
}

/** Who the caller is talking to — for BTG, both names. */
export function chatTitle(chat: Pick<ApiDealChat, "sponsorName" | "sellerName" | "yourSide">): string {
  if (chat.yourSide === "SPONSOR") return chat.sellerName;
  if (chat.yourSide === "SELLER") return chat.sponsorName;
  return `${chat.sponsorName} and ${chat.sellerName}`;
}

/** Whether the caller only reads: BTG, and the sponsor's analyst (who may still report a message). */
export function isReadOnly(chat: Pick<ApiDealChat, "yourSide" | "mayAccept">): boolean {
  return chat.yourSide === null || (chat.yourSide === "SPONSOR" && !chat.mayAccept);
}

const ENDED = new Set(["CANCELLED", "CLOSED", "REFUNDED"]);

/** The chat no longer takes anything: it closed, or its order ended. */
export function isEnded(chat: Pick<ApiDealChat, "state" | "orderState">): boolean {
  return chat.state !== "OPEN" || ENDED.has(chat.orderState);
}

/** May the caller type: on a side, not the analyst, and the chat still open. */
export function canWrite(chat: Pick<ApiDealChat, "yourSide" | "mayAccept" | "state" | "orderState">): boolean {
  return !isReadOnly(chat) && !isEnded(chat);
}

/* ------------------------------------------------------------------ time */

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const DAY_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const DAY_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "9:41 AM" in the reader's own time zone. */
export function timeOf(iso: string): string {
  return TIME.format(new Date(iso));
}

/** The line between two days of a chat: Today, Yesterday, "Wed, Nov 18", and the year once it is another one. */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  return d.getFullYear() === now.getFullYear() ? DAY_LONG.format(d) : DAY_YEAR.format(d);
}

/** How long ago, as a chat list says it: now, 5m, 9h, 3d, then the date. */
export function agoShort(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return DAY_SHORT.format(new Date(iso));
}

/** "Sign by Dec 2 · 6 days left" — the 10-working-day limit, while the order is still in the chat. */
export function deadlineWords(iso: string | null, now: Date): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const end = new Date(iso);
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const by = `Sign by ${DAY_SHORT.format(end)}`;
  if (days <= 0) return { text: `${by} · today`, urgent: true };
  return { text: `${by} · ${days} day${days === 1 ? "" : "s"} left`, urgent: days <= 2 };
}

/* ------------------------------------------------------------------ the checklist */

export type CardRow = {
  key: string;
  question: string;
  multi: boolean;
  answers: { value: string; label: string }[];
  /**
   * agreed  both picked the same: locked.
   * differ  both picked, not the same: change a pick or make an offer.
   * yours   the caller hasn't picked yet (the other side may have).
   * theirs  the caller picked; the other side hasn't.
   * open    nobody has picked (what BTG sees for an untouched card).
   */
  state: "agreed" | "differ" | "yours" | "theirs" | "open";
  /** The caller's own pick — for BTG, the sponsor's. */
  mine: string[] | null;
  /** The other side's pick — for BTG, the seller's. */
  theirs: string[] | null;
  mineLabel: string;
  theirsLabel: string;
  /** An offer about this card is still open. */
  offerOpen: boolean;
};

function labelsOf(card: ApiDealCard, values: string[] | null): string {
  if (!values || values.length === 0) return "";
  return values.map((v) => card.answers.find((a) => a.value === v)?.label ?? v).join(", ");
}

/** The checklist's rows as the caller reads them (spec §3.2). */
export function cardRows(chat: Pick<ApiDealChat, "status" | "yourSide">): CardRow[] {
  const sellerView = chat.yourSide === "SELLER";
  return chat.status.cards.map((c) => {
    const mine = sellerView ? c.seller : c.sponsor;
    const theirs = sellerView ? c.sponsor : c.seller;
    const state: CardRow["state"] = c.agreed
      ? "agreed"
      : mine && theirs
        ? "differ"
        : chat.yourSide === null
          ? mine || theirs ? "theirs" : "open"
          : mine
            ? "theirs"
            : "yours";
    return {
      key: c.key, question: c.question, multi: c.multi, answers: c.answers, state, mine, theirs,
      mineLabel: labelsOf(c, mine), theirsLabel: labelsOf(c, theirs),
      offerOpen: chat.status.openExchanges.some((x) => x.cardKey === c.key),
    };
  });
}

/** The question of a card, for an offer made about it. */
export function cardQuestion(chat: Pick<ApiDealChat, "status">, key: string | null): string | null {
  if (!key) return null;
  return chat.status.cards.find((c) => c.key === key)?.question ?? null;
}

/** The first card the caller still has to answer, and its place in the list — the question the chat asks next. */
export function nextQuestion(chat: Pick<ApiDealChat, "status" | "yourSide">): { row: CardRow; index: number; total: number } | null {
  if (!chat.yourSide) return null;
  const rows = cardRows(chat);
  const index = rows.findIndex((r) => r.state === "yours");
  return index < 0 ? null : { row: rows[index]!, index, total: rows.length };
}

/* ------------------------------------------------------------------ the final amount */

export type AmountView = {
  originalCents: number;
  mineCents: number | null;
  theirsCents: number | null;
  agreed: boolean;
  agreedCents: number | null;
  /** Both typed one and they are not the same (spec §3.7: "Your amounts don't match"). */
  mismatch: boolean;
  /** What the box starts with: the caller's own, else the other side's, else the original. */
  prefillCents: number;
};

export function amountView(chat: Pick<ApiDealChat, "status" | "yourSide">): AmountView {
  const a = chat.status.amount;
  const sellerView = chat.yourSide === "SELLER";
  const mine = sellerView ? a.sellerCents : a.sponsorCents;
  const theirs = sellerView ? a.sponsorCents : a.sellerCents;
  return {
    originalCents: a.originalCents, mineCents: mine, theirsCents: theirs, agreed: a.agreed, agreedCents: a.agreedCents,
    mismatch: !a.agreed && mine != null && theirs != null && mine !== theirs,
    prefillCents: mine ?? theirs ?? a.originalCents,
  };
}

/** The amount can still be set: only while the order is in the chat stage, and not once both agreed it. */
export function amountOpen(chat: Pick<ApiDealChat, "status" | "orderState" | "state">): boolean {
  return chat.state === "OPEN" && chat.orderState === "IN_CHAT" && !chat.status.amount.agreed;
}

/* ------------------------------------------------------------------ where the deal stands */

export type DealStage = {
  key: "talking" | "sign" | "signed-held" | "signed-pay" | "paid" | "off" | "ended";
  /** The pill: "Agreeing the details", "Ready to sign", … */
  label: string;
  tone: "info" | "you" | "wait" | "good" | "off";
  /** One sentence: what happens now, said to whoever is reading. */
  text: string;
};

const PAY_DUE = new Set(["APPROVED", "AWAITING_PAYMENT"]);
const PAID = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);

/** Where the deal stands, in the reader's own words (spec §3.6–§3.9). */
export function dealStage(chat: ApiDealChat): DealStage {
  const you = chat.yourSide;
  const other = you ? sideName(chat, otherSide(you)) : "";
  if (chat.calledOff) {
    const by = you && chat.calledOff.side === you ? "You" : sideName(chat, chat.calledOff.side);
    return { key: "off", label: "Deal called off", tone: "off", text: `${by} called the deal off. The order is cancelled and nothing was charged.` };
  }
  if (chat.orderState === "CANCELLED") return { key: "ended", label: "Order cancelled", tone: "off", text: "This order was cancelled, so the chat is read-only." };
  if (chat.orderState === "REFUNDED") return { key: "ended", label: "Order refunded", tone: "off", text: "This order was refunded, so the chat is read-only." };
  if (PAID.has(chat.orderState)) {
    return chat.orderState === "CLOSED"
      ? { key: "ended", label: "Order complete", tone: "good", text: "The order is delivered and closed. The chat is read-only." }
      : { key: "paid", label: "Paid", tone: "good", text: "The agreement is signed and the order is paid. Use the chat for delivery: times, places and drafts." };
  }
  if (PAY_DUE.has(chat.orderState)) {
    return {
      key: "signed-pay", label: "Signed by both", tone: you === "SPONSOR" ? "you" : "wait",
      text: you === "SPONSOR" ? "Both of you signed. Pay on the order page to lock in the dates." : you === "SELLER" ? "Signed by both: waiting for the sponsor's payment." : "Signed by both. The sponsor has 3 days to pay.",
    };
  }
  if (chat.orderState === "PENDING_APPROVAL") {
    return { key: "signed-held", label: "Signed · BTG is checking", tone: "wait", text: "Both of you signed. The final amount is above the sponsor's spending limit, so BTG checks the order before payment opens." };
  }
  if (chat.agreement) {
    const yours = you ? chat.status.turn.includes(you) : false;
    return {
      key: "sign", label: "Ready to sign", tone: yours ? "you" : "wait",
      text: yours ? "Everything is agreed. Read the agreement and sign it." : you ? `You signed. Waiting for ${other} to sign.` : "Everything is agreed. The agreement is out for both signatures.",
    };
  }
  const s = chat.status;
  return {
    key: "talking", label: "Agreeing the details", tone: you && s.turn.includes(you) ? "you" : "info",
    text: `${s.agreedCount} of ${s.cardCount} questions agreed${s.amount.agreed ? ", and the final amount" : ""}.`,
  };
}

/**
 * What the caller should do next, or who they wait for — the one line under
 * the chat's title and in the list. Never more than one thing.
 */
export function nextMove(chat: ApiDealChat): string {
  const you = chat.yourSide;
  const stage = dealStage(chat);
  if (stage.key !== "talking") return stage.text;
  const s = chat.status;
  if (!you) return s.notYet.length ? capital(s.notYet.join("; ")) + "." : stage.text;
  const other = sideName(chat, otherSide(you));
  const rows = cardRows(chat);
  const mineOpen = rows.filter((r) => r.state === "yours").length;
  if (mineOpen) return `Your turn: answer ${mineOpen} question${mineOpen === 1 ? "" : "s"}.`;
  const offer = s.openExchanges.find((x) => x.waitingOn === you);
  if (offer) return "Your turn: an offer is waiting for your answer.";
  const differ = rows.filter((r) => r.state === "differ" && !r.offerOpen).length;
  if (differ) return `Your answers differ on ${differ} question${differ === 1 ? "" : "s"}. Change one, or make an offer.`;
  const a = amountView(chat);
  if (!a.agreed && a.mineCents == null) return chat.mayAccept ? "Your turn: confirm the final amount." : "The final amount waits for your parent or guardian.";
  if (a.mismatch) return "Your amounts don't match. Settle it in the chat, then confirm again.";
  if (s.heldForBtg) return "A message is waiting for a BTG check.";
  return `Waiting for ${other}.`;
}

const capital = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** Is it the caller's move (the list's "Your turn" filter and the orange dot). */
export function yourTurn(chat: Pick<ApiDealChat, "yourSide" | "status" | "state" | "orderState">): boolean {
  return !!chat.yourSide && !isEnded(chat) && chat.status.turn.includes(chat.yourSide);
}

/* ------------------------------------------------------------------ the thread */

export type ThreadMessage = {
  type: "message";
  id: string;
  /** Sent by the caller's own side. For BTG: the sponsor's messages sit on the right. */
  mine: boolean;
  side: DealSide;
  author: string;
  kind: ApiDealMessage["kind"];
  body: string;
  time: string;
  createdAt: string;
  byGuardian: boolean;
  state: ApiDealMessage["state"];
  keptBackReason: string | null;
  /** First and last of a run of messages from one side within five minutes (rounded corners, one picture). */
  first: boolean;
  last: boolean;
  /** The offer this message belongs to, when it is an offer or a reply. */
  exchange: OfferView | null;
  /** This is the offer's latest message: the buttons sit under it. */
  latestOfOffer: boolean;
  /** BTG only. */
  heldReasons: string[];
  reported: boolean;
  reportReason: string | null;
};

export type ThreadItem = { type: "day"; id: string; label: string } | ThreadMessage;

export type OfferView = {
  id: string;
  state: ApiDealExchange["state"];
  /** The question the offer is about, if it is about one. */
  about: string | null;
  latestMessageId: string | null;
  youAccepted: boolean;
  theyAccepted: boolean;
  sponsorAccepted: boolean;
  sellerAccepted: boolean;
  /** Waiting for a BTG check: nobody can answer it yet. */
  held: boolean;
};

const RUN_MS = 5 * 60_000;

/** The chat as a list of days and bubbles, oldest first. */
export function threadOf(chat: ApiDealChat, now: Date): ThreadItem[] {
  const rightSide: DealSide = chat.yourSide ?? "SPONSOR";
  const offers = new Map<string, OfferView>();
  for (const x of chat.exchanges) {
    const latest = chat.messages.find((m) => m.id === x.latestMessageId);
    offers.set(x.id, {
      id: x.id, state: x.state, about: cardQuestion(chat, x.cardKey), latestMessageId: x.latestMessageId,
      youAccepted: chat.yourSide === "SELLER" ? x.sellerAccepted : x.sponsorAccepted,
      theyAccepted: chat.yourSide === "SELLER" ? x.sponsorAccepted : x.sellerAccepted,
      sponsorAccepted: x.sponsorAccepted, sellerAccepted: x.sellerAccepted,
      held: x.state === "OPEN" && (latest?.state === "HELD" || chat.status.openExchanges.some((o) => o.id === x.id && o.waitingOn === "BTG")),
    });
  }
  const out: ThreadItem[] = [];
  let day = "";
  const msgs = chat.messages;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    const label = dayLabel(m.createdAt, now);
    if (label !== day) {
      day = label;
      out.push({ type: "day", id: `day-${m.id}`, label });
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const t = new Date(m.createdAt).getTime();
    const joins = (o: ApiDealMessage | undefined) =>
      !!o && o.side === m.side && o.kind === "TEXT" && m.kind === "TEXT" && o.byGuardian === m.byGuardian &&
      Math.abs(new Date(o.createdAt).getTime() - t) < RUN_MS && dayLabel(o.createdAt, now) === label;
    const exchange = m.exchangeId ? offers.get(m.exchangeId) ?? null : null;
    out.push({
      type: "message", id: m.id, mine: m.side === rightSide, side: m.side, author: sideName(chat, m.side), kind: m.kind, body: m.body,
      time: timeOf(m.createdAt), createdAt: m.createdAt, byGuardian: m.byGuardian, state: m.state, keptBackReason: m.keptBackReason,
      first: !joins(prev), last: !joins(next), exchange, latestOfOffer: !!exchange && exchange.latestMessageId === m.id,
      heldReasons: m.heldReasons ?? [], reported: !!m.reported, reportReason: m.reportReason ?? null,
    });
  }
  return out;
}

export type OfferButtons = {
  /** Reply, Accept and Decline may be shown at all (an open offer, the caller on a side, the chat open). */
  open: boolean;
  canReply: boolean;
  canAccept: boolean;
  canDecline: boolean;
  /** The line under the offer: who has accepted, who it waits for, or how it ended. */
  note: string;
};

/** The buttons under an offer's latest message, and the line that says where it stands (spec §3.4). */
export function offerButtons(chat: ApiDealChat, offer: OfferView): OfferButtons {
  const you = chat.yourSide;
  const none = { open: false, canReply: false, canAccept: false, canDecline: false };
  if (offer.state === "AGREED") return { ...none, note: "Accepted by both. It goes into the agreement, word for word." };
  if (offer.state === "DECLINED") return { ...none, note: "Declined. The question is open again." };
  if (offer.held) return { ...none, note: "Waiting for a BTG check. It can be answered once it is cleared." };
  const names = { sponsor: chat.sponsorName, seller: chat.sellerName };
  if (!you) {
    const who = [offer.sponsorAccepted ? names.sponsor : null, offer.sellerAccepted ? names.seller : null].filter(Boolean);
    return { ...none, note: who.length ? `Accepted by ${who.join(" and ")}.` : "Open: neither side has accepted yet." };
  }
  const other = sideName(chat, otherSide(you));
  const writable = canWrite(chat);
  const note = offer.youAccepted
    ? `You accepted. Waiting for ${other}.`
    : offer.theyAccepted
      ? `${other} accepted. It is agreed when you accept too.`
      : "Agreed when both of you accept it as it stands.";
  return {
    open: writable,
    canReply: writable,
    canAccept: writable && chat.mayAccept && !offer.youAccepted,
    canDecline: writable,
    note: writable && !chat.mayAccept ? "Only your parent or guardian can accept an offer." : note,
  };
}

/* ------------------------------------------------------------------ the list of chats */

export type ChatRow = {
  id: string;
  orderId: string;
  orderRef: string;
  /** Who the caller is talking to. */
  title: string;
  /** The last thing said, or where the deal stands when nothing was. */
  preview: string;
  lastActionAt: string;
  unread: number;
  yourTurn: boolean;
  ended: boolean;
  stage: DealStage;
  /** What the reader should do next, or who they wait for (nextMove). */
  next: string;
  /** The agreement, once the chat has posted it. */
  agreementId: string | null;
};

/** One chat as its row in the list. */
export function chatRow(chat: ApiDealChat): ChatRow {
  const last = [...chat.messages].reverse().find((m) => m.state !== "KEPT_BACK");
  const stage = dealStage(chat);
  let preview = nextMove(chat);
  if (last && stage.key === "talking") {
    const who = chat.yourSide ? (last.side === chat.yourSide ? "You: " : "") : `${sideName(chat, last.side)}: `;
    const tag = last.kind === "OFFER" ? "Offer: " : "";
    preview = `${who}${tag}${last.body.replace(/\s+/g, " ")}`;
  }
  return {
    id: chat.id, orderId: chat.orderId, orderRef: chat.orderRef, title: chatTitle(chat), preview,
    lastActionAt: chat.lastActionAt, unread: chat.unread, yourTurn: yourTurn(chat), ended: isEnded(chat), stage,
    next: nextMove(chat), agreementId: chat.agreement?.id ?? null,
  };
}

/** A row for a chat whose detail could not be read: its order number, and nothing guessed. */
export function summaryRow(s: ApiDealChatSummary): ChatRow {
  const ended = s.state !== "OPEN";
  return {
    id: s.id, orderId: s.orderId, orderRef: s.orderRef, title: `Order ${s.orderRef}`, preview: ended ? "This chat is closed." : "Open the chat to see where the deal stands.",
    lastActionAt: s.lastActionAt, unread: s.unread, yourTurn: false, ended,
    stage: ended ? { key: "ended", label: "Closed", tone: "off", text: "" } : { key: "talking", label: "Agreeing the details", tone: "info", text: "" },
    next: ended ? "This chat is closed." : "Open the chat to see where the deal stands.", agreementId: s.dealAgreementId,
  };
}

export type ChatFilter = "all" | "unread" | "turn";

/** The list as the search box and the three chips narrow it; the newest activity first. */
export function filterRows(rows: readonly ChatRow[], filter: ChatFilter, query: string): ChatRow[] {
  const q = query.trim().toLowerCase();
  return rows
    .filter((r) => (filter === "unread" ? r.unread > 0 : filter === "turn" ? r.yourTurn : true))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.orderRef.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q))
    .sort((a, b) => (a.lastActionAt < b.lastActionAt ? 1 : a.lastActionAt > b.lastActionAt ? -1 : 0));
}

/** Unread messages across every chat — the number on the Messages link and the round button. */
export function unreadTotal(rows: readonly { unread: number }[]): number {
  return rows.reduce((n, r) => n + r.unread, 0);
}

/* ------------------------------------------------------------------ signing */

/**
 * The confirmations a side ticks before it signs (spec §5.1). The seller's
 * for an athlete or a team; the guardian's one more; the sponsor's own.
 */
export function confirmationsFor(side: DealSide, viewer: DealViewer): string[] {
  if (side === "SPONSOR") {
    return ["Our product is not in a restricted category (alcohol, tobacco or vaping, cannabis, gambling, firearms, adult content), unless BTG approved this deal."];
  }
  const team = viewer.portal === "property";
  const out = [
    team ? "The team will tag the sponsor and label every post as an ad." : viewer.guardian ? "The athlete will tag the sponsor and label every post as an ad." : "I will tag the sponsor and label every post as an ad.",
    team ? "We have checked that school, league and local rules allow this deal." : viewer.guardian ? "We have checked that the athlete's school, league and local rules allow this deal." : "I have checked that my school, league and local rules allow this deal.",
  ];
  if (viewer.guardian) out.push("As the parent or guardian, I consent to this deal.");
  return out;
}

/** Who has signed the agreement, said to the reader. */
export function signedWords(a: Pick<ApiDealAgreement, "sponsorSignedAt" | "sellerSignedAt" | "state" | "signedByGuardian">, chat: Pick<ApiDealChat, "sponsorName" | "sellerName" | "yourSide">): { sponsor: string; seller: string; youSigned: boolean } {
  const say = (name: string, at: string | null, guardian = false) => (at ? `${name} signed ${DAY_SHORT.format(new Date(at))}${guardian ? " (parent or guardian)" : ""}` : `${name} hasn't signed yet`);
  return {
    sponsor: say(chat.sponsorName, a.sponsorSignedAt),
    seller: say(chat.sellerName, a.sellerSignedAt, a.signedByGuardian),
    youSigned: chat.yourSide === "SPONSOR" ? !!a.sponsorSignedAt : chat.yourSide === "SELLER" ? !!a.sellerSignedAt : false,
  };
}

/** Where the agreement's PDF is fetched from in the web app (app/(app)/deal-agreements/[id]/download). */
export function agreementHref(id: string): string {
  return `/deal-agreements/${encodeURIComponent(id)}/download`;
}

/** Where a chat opens in each portal. */
export function messagesHref(portal: DealViewer["portal"], chatId?: string): string {
  const base = portal === "admin" ? "/admin/deal-chats" : `/${portal}/messages`;
  return chatId ? `${base}?chat=${encodeURIComponent(chatId)}` : base;
}

/** The order this chat belongs to, where the reader can open it (a seller's order is only on their list once paid). */
export function orderHref(portal: DealViewer["portal"], orderId: string): string | null {
  if (portal === "sponsor") return `/sponsor/orders/${encodeURIComponent(orderId)}`;
  if (portal === "admin") return `/admin/marketplace/orders/${encodeURIComponent(orderId)}`;
  return null;
}

/* ------------------------------------------------------------------ refusals */

/**
 * What a refused write says. The API's own sentence when it sent one (the
 * 409s and 422s are written for the person: "Both sides agreed this answer,
 * so it can't be changed."), plain words for the rest.
 */
export function dealRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 0) return "We couldn't reach SponsorX. Check your connection and try again.";
  if (status === 401) return "Your session ended. Sign in again, then retry.";
  const err = (body as { error?: { message?: unknown; issues?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : typeof (body as { message?: unknown } | null)?.message === "string" ? ((body as { message: string }).message) : "";
  if (status === 403) return "You can't do that in this chat.";
  if (status === 404) return "This chat can't be found. It may belong to another account.";
  if (message && (status === 409 || status === 422)) return message;
  if (status === 400) return message || "That wasn't accepted. Check it and try again.";
  return message || `${fallback} (${status}).`;
}

/* ------------------------------------------------------------------ BTG's desk */

export type ReviewRow = ApiDealReviewItem & {
  /** "Held" before delivery, or "Reported" by a side. */
  why: "held" | "reported";
  reasons: string[];
};

/** The desk's rows: held messages first (nobody has read them yet), then reports; the oldest first in each. */
export function reviewRows(items: readonly ApiDealReviewItem[]): ReviewRow[] {
  const rows = items.map((m): ReviewRow => {
    const why = m.state === "HELD" ? "held" : "reported";
    return { ...m, why, reasons: why === "held" ? m.heldReasons : m.reportReason ? [m.reportReason] : [] };
  });
  return [...rows.filter((r) => r.why === "held"), ...rows.filter((r) => r.why === "reported")];
}

export const KIND_WORD: Record<ApiDealMessage["kind"], string> = { TEXT: "Message", OFFER: "Offer", REPLY: "Reply to an offer" };
