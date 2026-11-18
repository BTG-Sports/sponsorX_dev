/**
 * Deal Chat — the plain rules (2S4-BE-16, feature spec §3.2–§3.4, §4, §6). Pure.
 *
 * - CARDS. A card is agreed when both sides picked the same answer, and from
 *   then on neither side can change it (owner, 2026-11-18: "an answer cannot
 *   be changed once both parties approved").
 * - OFFERS. Free text. Agreed when both sides have accepted its latest
 *   message; a new reply clears both accepts. An agreed exchange goes into
 *   the agreement word for word (D4); the card itself is agreed by matching
 *   picks, so every D3 line stays the approved sentence.
 * - THE FINAL AMOUNT (2S4-BE-15). Pre-filled with the original; each side
 *   confirms it or types over it. Agreed when the two match, and then locked,
 *   like a card — so the form, posted after, never changes.
 * - ALL GREEN. Every card agreed, the amount agreed, no offer open, nothing
 *   waiting for BTG. Only then is the form posted, and the server checks it
 *   again right before each signature (owner, 2026-11-18).
 * - WATCHING. Contact details and outside payment links hold a message for
 *   BTG (restricted words are checked from BTG's list, restricted-words.ts).
 *   Dollar figures in agreed exchanges raise the money nudge. Plain rules,
 *   not an AI service (§6).
 */
import { cardsFor, type DealCard, type DealForm } from "./deal-cards";

export type Side = "SPONSOR" | "SELLER";
export const otherSide = (s: Side): Side => (s === "SPONSOR" ? "SELLER" : "SPONSOR");

export const DEAL_CHAT_TEXT_MAX = 4000;
/** Reminders: whoever's turn it is, after every 2 working days without a reply (owner, 2026-11-17). */
export const DEAL_CHAT_REMINDER_WORKING_DAYS = 2;
/** Signed by both within 10 working days of the order being placed, or it is cancelled (§4; a setting, env DEAL_CHAT_SIGNING_WORKING_DAYS). */
export const DEAL_CHAT_SIGNING_WORKING_DAYS = 10;
/** Both sides get a last warning this many working days before the limit (§4). */
export const DEAL_CHAT_LAST_WARNING_WORKING_DAYS = 2;
/** The largest final amount the chat takes: $1,000,000. */
export const DEAL_CHAT_AMOUNT_MAX_CENTS = 100_000_000;
/** Unread messages are collected into one email after 15 minutes (§4). */
export const DEAL_CHAT_UNREAD_DELAY_MS = 15 * 60 * 1000;

/* ── what holds a message for BTG ──────────────────────────────────────── */

const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[a-z0-9-]+)*\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i;
/** Ten or more digits, allowing the usual separators: a phone number. */
const PHONE = /(?:\+?\d[\s().-]{0,3}){10,}/;
/** @name, not part of an email address. */
const HANDLE = /(?:^|[^\w@.])@[a-z0-9_](?:[a-z0-9_.]{1,29})/i;
const LINK = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|app|link|ly|gg|tv|to|biz|info|us|page|site)\b(?:\/|\b)/i;
/** Outside payment: a Cash App $cashtag, or the services by name. */
const CASHTAG = /(?:^|\s)\$[a-z][a-z0-9_]{1,19}\b/i;
const PAY_APPS = /\b(?:venmo|paypal|zelle|cash\s?app|cashapp|apple\s?pay|google\s?pay|wire\s+transfer|bank\s+transfer|crypto|bitcoin|btc|usdt)\b/i;

/** Why a message must wait for BTG before the other side sees it: contact details or outside payment. Restricted words are added by the caller. */
export function contactReasons(text: string): string[] {
  const out: string[] = [];
  if (EMAIL.test(text)) out.push("An email address");
  /* An email address is one reason, not also a link or a handle. */
  const rest = text.replace(new RegExp(EMAIL.source, "gi"), " ");
  if (PHONE.test(rest)) out.push("A phone number");
  if (HANDLE.test(rest)) out.push("A social media handle");
  if (LINK.test(rest)) out.push("An outside link");
  if (CASHTAG.test(text) || PAY_APPS.test(text)) out.push("Payment outside SponsorX");
  return out;
}

/* ── the money nudge ───────────────────────────────────────────────────── */

const DOLLARS = /\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|usd)\b/gi;

/** The dollar figures a text names, as written, each once. */
export function dollarFigures(text: string): string[] {
  return [...new Set((text.match(DOLLARS) ?? []).map((m) => m.trim()))];
}

/* ── working days (Monday to Friday, UTC) ──────────────────────────────── */

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** 2S4-BE-15 — when an order in the chat must be signed by both, and when both sides get the last warning. */
export function signingDeadline(placedAt: Date, workingDays = DEAL_CHAT_SIGNING_WORKING_DAYS): { deadline: Date; warnAt: Date } {
  return {
    deadline: addWorkingDays(placedAt, workingDays),
    warnAt: addWorkingDays(placedAt, Math.max(1, workingDays - DEAL_CHAT_LAST_WARNING_WORKING_DAYS)),
  };
}

/* ── where the deal stands ─────────────────────────────────────────────── */

export type PickValue = readonly string[];
export type StatusInput = {
  forms: readonly DealForm[];
  picks: readonly { cardKey: string; side: Side; value: PickValue }[];
  exchanges: readonly {
    id: string; cardKey: string | null; state: string;
    /** The latest message's author and whether it waits for BTG. */
    latest: { id: string; side: Side; held: boolean } | null;
    sponsorAcceptedMessageId: string | null; sellerAcceptedMessageId: string | null;
    /** Visible texts, for the money nudge (agreed exchanges only). */
    texts: readonly string[];
  }[];
  heldCount: number;
  /** 2S4-BE-15 — the final amount: the original, and what each side confirmed (null: not yet). */
  amount: { originalCents: number; sponsorCents: number | null; sellerCents: number | null };
  agreement: { id: string; state: string; sponsorSigned: boolean; sellerSigned: boolean } | null;
};

export type CardStatus = {
  key: string; question: string; multi: boolean;
  answers: { value: string; label: string }[];
  sponsor: string[] | null; seller: string[] | null;
  agreed: boolean;
};
export type AmountStatus = { originalCents: number; sponsorCents: number | null; sellerCents: number | null; agreed: boolean; agreedCents: number | null };
export type ExchangeStatus = { id: string; cardKey: string | null; waitingOn: Side | "BTG" | null };
export type DealStatus = {
  cards: CardStatus[];
  agreedCount: number; cardCount: number;
  /** 2S4-BE-15 — the final amount, agreed when both sides' match. */
  amount: AmountStatus;
  openExchanges: ExchangeStatus[];
  heldForBtg: number;
  /** Every card agreed, no offer open, nothing waiting for BTG. */
  allGreen: boolean;
  /** What still stands between the chat and the form, in words. Empty when all green. */
  notYet: string[];
  /** Whose move it is: either side, both, BTG, or nobody. */
  turn: (Side | "BTG")[];
  /** Dollar figures named in agreed exchanges: the final amount should be checked against them. */
  moneyFigures: string[];
};

const same = (a: PickValue, b: PickValue) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** Is the final amount agreed: both sides confirmed one, and the same. */
export function amountAgreed(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && a === b;
}

/** Is this card agreed: both sides picked, and the same answer. */
export function cardAgreed(a: PickValue | undefined, b: PickValue | undefined): boolean {
  return !!a && !!b && same(a, b);
}

function exchangeWaitingOn(x: StatusInput["exchanges"][number]): Side | "BTG" | null {
  if (!x.latest) return null;
  if (x.latest.held) return "BTG";
  const accepted = (s: Side) => (s === "SPONSOR" ? x.sponsorAcceptedMessageId : x.sellerAcceptedMessageId) === x.latest!.id;
  const other = otherSide(x.latest.side);
  if (!accepted(other)) return other;
  if (!accepted(x.latest.side)) return x.latest.side;
  return null;
}

export function dealStatus(input: StatusInput): DealStatus {
  const pickOf = (key: string, side: Side) => input.picks.find((p) => p.cardKey === key && p.side === side)?.value;
  const open = input.exchanges.filter((x) => x.state === "OPEN");
  const cards: CardStatus[] = cardsFor(input.forms).map((c: DealCard) => {
    const sponsor = pickOf(c.key, "SPONSOR");
    const seller = pickOf(c.key, "SELLER");
    return {
      key: c.key, question: c.question, multi: !!c.multi,
      answers: c.answers.map((a) => ({ value: a.value, label: a.label })),
      sponsor: sponsor ? [...sponsor] : null, seller: seller ? [...seller] : null,
      agreed: cardAgreed(sponsor, seller),
    };
  });
  const openExchanges = open.map((x) => ({ id: x.id, cardKey: x.cardKey, waitingOn: exchangeWaitingOn(x) }));
  const agreedCount = cards.filter((c) => c.agreed).length;
  const a = input.amount;
  const amount: AmountStatus = {
    originalCents: a.originalCents, sponsorCents: a.sponsorCents, sellerCents: a.sellerCents,
    agreed: amountAgreed(a.sponsorCents, a.sellerCents), agreedCents: amountAgreed(a.sponsorCents, a.sellerCents) ? a.sponsorCents : null,
  };

  const notYet: string[] = [];
  if (agreedCount < cards.length) notYet.push(`${cards.length - agreedCount} of ${cards.length} questions not agreed yet`);
  if (!amount.agreed) notYet.push(a.sponsorCents != null && a.sellerCents != null ? "your amounts don't match" : "the final amount isn't confirmed by both sides yet");
  if (open.length) notYet.push(`${open.length} offer${open.length > 1 ? "s" : ""} still open`);
  if (input.heldCount) notYet.push(`${input.heldCount} message${input.heldCount > 1 ? "s" : ""} waiting for a BTG check`);
  const allGreen = notYet.length === 0;

  const turn = new Set<Side | "BTG">();
  if (input.agreement && input.agreement.state === "SIGNED") {
    /* Signed by both: nobody owes a move in the chat. */
  } else if (input.agreement && input.agreement.state === "OPEN") {
    if (!input.agreement.sponsorSigned) turn.add("SPONSOR");
    if (!input.agreement.sellerSigned) turn.add("SELLER");
  } else {
    for (const c of cards) {
      if (c.agreed) continue;
      if (!c.sponsor) turn.add("SPONSOR");
      if (!c.seller) turn.add("SELLER");
      if (c.sponsor && c.seller && !open.some((x) => x.cardKey === c.key)) { turn.add("SPONSOR"); turn.add("SELLER"); }
    }
    for (const x of openExchanges) if (x.waitingOn) turn.add(x.waitingOn);
    if (!amount.agreed) {
      if (a.sponsorCents == null) turn.add("SPONSOR");
      if (a.sellerCents == null) turn.add("SELLER");
      if (a.sponsorCents != null && a.sellerCents != null) { turn.add("SPONSOR"); turn.add("SELLER"); }
    }
  }
  if (input.heldCount) turn.add("BTG");

  const moneyFigures = [...new Set(input.exchanges.filter((x) => x.state === "AGREED").flatMap((x) => x.texts.flatMap(dollarFigures)))];
  return {
    cards, agreedCount, cardCount: cards.length, amount, openExchanges, heldForBtg: input.heldCount,
    allGreen, notYet, turn: (["SPONSOR", "SELLER", "BTG"] as const).filter((s) => turn.has(s)), moneyFigures,
  };
}
