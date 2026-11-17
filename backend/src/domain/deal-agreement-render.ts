/**
 * Deal Chat — the filled-in agreement (2S4-BE-14). Pure.
 *
 * The approved template (backend/agreements/DEAL.<v>.txt) with its blanks
 * filled from the order and the chat. What this returns is the exact text
 * both sides read and sign; its hash (agreement-hash.ts) is what each side's
 * AgreementAcceptance records.
 *
 * Two passes over the TEMPLATE only: first the [[FORM X]] … [[/FORM]] blocks
 * are kept or dropped, then every {{blank}} is replaced in one regex pass. A
 * value is never scanned again, so text a person typed in the chat — even
 * "{{amount}}" or "[[FORM CONTENT]]" — is copied as written and can't reach
 * into the template.
 */
import { DEAL_FORM_TITLE, answerSentence, cardByKey, cardsFor, type AnswerValue, type DealForm } from "./deal-cards";

export class DealAgreementIncompleteError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "DealAgreementIncompleteError";
  }
}

export type DealSeller =
  | { kind: "ATHLETE"; name: string }
  | { kind: "MINOR"; name: string; guardianName: string }
  | { kind: "TEAM"; name: string };

export type DealExchangeMessage = { by: "Sponsor" | "Seller"; at: Date; text: string };

export type DealAgreementFacts = {
  forms: readonly DealForm[];
  sponsorName: string;
  seller: DealSeller;
  orderRef: string;
  /** When the form was posted. */
  date: Date;
  items: readonly { title: string; quantity: number; startsOn: Date; endsOn: Date }[];
  /** Every card the forms ask, agreed. */
  answers: Readonly<Record<string, AnswerValue>>;
  /** Each agreed offer exchange, its messages in order; the card it settled, if any. */
  specialTerms: readonly { cardKey?: string | null; messages: readonly DealExchangeMessage[] }[];
  amountCents: number;
  originalAmountCents: number;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const stamp = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
export const usdOf = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sellerWords(s: DealSeller): string {
  if (s.kind === "MINOR") return `${s.name}, represented by their parent or guardian ${s.guardianName}`;
  return s.name;
}

/** Keep the template's [[FORM X]] blocks for these forms, lettered D7a, D7b… when there is more than one. */
function keepForms(template: string, forms: readonly DealForm[]): string {
  let n = 0;
  const lettered = forms.length > 1;
  return template.replace(/\[\[FORM ([A-Z_]+)\]\]\n?([\s\S]*?)\[\[\/FORM\]\]\n?/g, (_all, form: string, block: string) => {
    if (!forms.includes(form as DealForm)) return "";
    const part = lettered ? String.fromCharCode(97 + n++) : "";
    return `${block.replace("{{part}}", part)}\n`;
  });
}

/** The D3 lines: every card the forms ask, in catalogue order. Throws when one is unanswered. */
function answerLines(forms: readonly DealForm[], answers: DealAgreementFacts["answers"]): string {
  const missing = cardsFor(forms).filter((c) => answers[c.key] === undefined);
  if (missing.length) throw new DealAgreementIncompleteError(`Not every question is agreed yet: ${missing.map((c) => c.key).join(", ")}.`);
  for (const key of Object.keys(answers)) {
    if (!cardByKey(key)) throw new DealAgreementIncompleteError(`Unknown question: ${key}.`);
  }
  return cardsFor(forms).map((c) => `- ${answerSentence(c, answers[c.key]!)}`).join("\n");
}

function specialTermLines(terms: DealAgreementFacts["specialTerms"]): string {
  if (!terms.length) return "None.";
  return terms
    .map((t, i) => {
      const about = t.cardKey ? cardByKey(t.cardKey)?.question : null;
      const head = `Special term ${i + 1}${about ? ` (on: ${about})` : ""}:`;
      const lines = t.messages.map((m) => `  [${m.by}, ${stamp(m.at)}] ${m.text.replace(/\r\n?/g, "\n").replace(/\n/g, "\n  ")}`);
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

function amountWords(amountCents: number, originalCents: number): string {
  return amountCents === originalCents
    ? `${usdOf(amountCents)}.`
    : `${usdOf(amountCents)}, agreed by both sides (the order's original amount was ${usdOf(originalCents)}).`;
}

/** The agreement both sides sign, filled in. */
export function renderDealAgreement(template: string, f: DealAgreementFacts): string {
  if (!f.forms.length) throw new DealAgreementIncompleteError("A deal needs at least one item.");
  const values: Record<string, string> = {
    formName: f.forms.length > 1 ? "PACKAGE" : DEAL_FORM_TITLE[f.forms[0]!],
    orderRef: f.orderRef,
    date: day(f.date),
    sponsor: f.sponsorName,
    seller: sellerWords(f.seller),
    items: f.items
      .map((i) => `- ${i.title} (×${i.quantity}) · ${day(i.startsOn)}${day(i.endsOn) !== day(i.startsOn) ? ` to ${day(i.endsOn)}` : ""}`)
      .join("\n"),
    answers: answerLines(f.forms, f.answers),
    specialTerms: specialTermLines(f.specialTerms),
    amount: amountWords(f.amountCents, f.originalAmountCents),
  };
  /* Blank-line runs left by dropped blocks are tidied in the TEMPLATE, before any value goes in. */
  const kept = keepForms(template, f.forms).replace(/\n{3,}/g, "\n\n");
  return kept.replace(/\{\{([a-zA-Z]+)\}\}/g, (all, key: string) => values[key] ?? all);
}
