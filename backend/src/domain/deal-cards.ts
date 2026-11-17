/**
 * Deal Chat — the agreement forms and the question cards (2S4-BE-14). Pure.
 *
 * The wording was approved by the programme owner on 2026-11-17
 * (documentation/deal-chat/SponsorX-Deal-Agreement-Forms-Draft.md) and is
 * issued as backend/agreements/DEAL.v1.txt. This file is the other half of
 * that approval: which form an item takes, which cards a deal asks, the
 * answers each card offers, and the exact sentence each answer becomes in
 * section D3 of the agreement. A change to any sentence here is a change to
 * the approved wording: it needs the owner's approval and a new DEAL version.
 */

export const DEAL_FORMS = ["CONTENT", "IN_PERSON", "PLACEMENT"] as const;
export type DealForm = (typeof DEAL_FORMS)[number];

/** How each form's name reads in the agreement's title. */
export const DEAL_FORM_TITLE: Readonly<Record<DealForm, string>> = {
  CONTENT: "CONTENT",
  IN_PERSON: "IN PERSON",
  PLACEMENT: "PLACEMENT",
};

/** The marketplace's item kinds (inventory.ts) and the form each takes. */
const FORM_OF_KIND: Readonly<Record<string, DealForm>> = {
  SOCIAL_POST: "CONTENT",
  VIDEO: "CONTENT",
  APPEARANCE: "IN_PERSON",
  AUTOGRAPH: "IN_PERSON",
  CAMP: "IN_PERSON",
  SIGNAGE: "PLACEMENT",
  TICKETS: "PLACEMENT",
  OTHER: "PLACEMENT",
};

/** The form an item kind takes; a kind this file doesn't know is a placement (the "Other" form). */
export function formOfKind(kind: string): DealForm {
  return FORM_OF_KIND[kind] ?? "PLACEMENT";
}

/**
 * The forms a deal needs, in the catalogue's fixed order, from the kinds of
 * the items bought. A PACKAGE is given as the kinds of the items inside it.
 */
export function formsFor(kinds: readonly string[]): DealForm[] {
  const wanted = new Set(kinds.filter((k) => k !== "PACKAGE").map(formOfKind));
  return DEAL_FORMS.filter((f) => wanted.has(f));
}

export type DealAnswer = { value: string; label: string; sentence: string };
export type DealCard = {
  key: string;
  /** The forms that ask it; "ALL" for every deal. */
  forms: readonly DealForm[] | "ALL";
  question: string;
  /** Tick any number of answers (platforms); otherwise exactly one. */
  multi?: true;
  answers: readonly DealAnswer[];
};

const yesNo = (yes: string, no: string): DealAnswer[] => [
  { value: "YES", label: "Yes", sentence: yes },
  { value: "NO", label: "No", sentence: no },
];

/** The approved cards, in the order D3 lists them. */
export const DEAL_CARDS: readonly DealCard[] = [
  {
    key: "APPROVAL_FIRST", forms: "ALL",
    question: "Does the Sponsor approve the content or plan before it goes live?",
    answers: yesNo(
      "The Sponsor reviews the content or plan before it goes live and answers within 2 working days; no answer counts as approval.",
      "The Seller does not need the Sponsor's approval before it goes live.",
    ),
  },
  {
    key: "EXCLUSIVITY", forms: "ALL",
    question: "Exclusivity: no competing brand in the same category during the deal?",
    answers: yesNo(
      "During the deal dates the Seller will not promote a brand that competes with the Sponsor in its category.",
      "The Seller may work with other brands, including competitors, during the deal.",
    ),
  },
  {
    key: "REUSE", forms: ["CONTENT"],
    question: "May the Sponsor reuse the content on its own channels?",
    answers: yesNo(
      "The Sponsor may share and repost the content on its own channels.",
      "The Sponsor may share the Seller's original post but not repost or reuse the content.",
    ),
  },
  {
    key: "PAID_ADS", forms: ["CONTENT"],
    question: "May the Sponsor use it in paid ads?",
    answers: yesNo("The Sponsor may use the content in paid advertising.", "The Sponsor may not use the content in paid advertising."),
  },
  {
    key: "USAGE_PERIOD", forms: ["CONTENT"],
    question: "How long may the Sponsor use it?",
    answers: [
      { value: "30_DAYS", label: "30 days", sentence: "The Sponsor may use the content for 30 days from its first posting." },
      { value: "90_DAYS", label: "90 days", sentence: "The Sponsor may use the content for 90 days from its first posting." },
      { value: "1_YEAR", label: "1 year", sentence: "The Sponsor may use the content for 1 year from its first posting." },
    ],
  },
  {
    key: "PLATFORMS", forms: ["CONTENT"], multi: true,
    question: "Which platforms?",
    /* The sentence is built from the ticked labels (platformSentence). */
    answers: [
      { value: "INSTAGRAM", label: "Instagram", sentence: "" },
      { value: "TIKTOK", label: "TikTok", sentence: "" },
      { value: "X", label: "X", sentence: "" },
      { value: "YOUTUBE", label: "YouTube", sentence: "" },
    ],
  },
  {
    key: "CHANGES", forms: ["CONTENT"],
    question: "One round of changes included?",
    answers: yesNo(
      "One round of changes is included, asked for within 2 working days of seeing the content.",
      "No changes are included once the content is delivered.",
    ),
  },
  {
    key: "TRAVEL", forms: ["IN_PERSON"],
    question: "Does the Sponsor cover travel?",
    answers: yesNo("The Sponsor covers the Seller's reasonable travel to and from the appearance.", "The Seller covers their own travel."),
  },
  {
    key: "FILMING", forms: ["IN_PERSON"],
    question: "May the Sponsor photograph or film it?",
    answers: yesNo(
      "The Sponsor may photograph and film the appearance and use the footage as the content terms allow.",
      "The Sponsor may not photograph or film the appearance.",
    ),
  },
  {
    key: "LENGTH", forms: ["IN_PERSON"],
    question: "How long?",
    answers: [
      { value: "1_HOUR", label: "1 hour", sentence: "The appearance lasts 1 hour." },
      { value: "2_HOURS", label: "2 hours", sentence: "The appearance lasts 2 hours." },
      { value: "HALF_DAY", label: "Half day", sentence: "The appearance lasts half a day." },
    ],
  },
  {
    key: "MATERIALS", forms: ["PLACEMENT"],
    question: "Does the Sponsor supply the artwork or materials?",
    answers: yesNo("The Sponsor supplies the artwork or materials.", "The Seller produces the artwork or materials from the Sponsor's brand assets."),
  },
  {
    key: "PERIOD_AS_LISTED", forms: ["PLACEMENT"],
    question: "Placement period as listed?",
    answers: yesNo("The placement runs for the period shown in D2.", "The placement period is as agreed in D4."),
  },
];

/** The cards a deal with these forms asks, in catalogue order. */
export function cardsFor(forms: readonly DealForm[]): DealCard[] {
  return DEAL_CARDS.filter((c) => c.forms === "ALL" || c.forms.some((f) => forms.includes(f)));
}

export function cardByKey(key: string): DealCard | undefined {
  return DEAL_CARDS.find((c) => c.key === key);
}

/** An answer as a list of values: one for a single card, one or more for a multi card. */
export type AnswerValue = string | readonly string[];

/** Whether `value` is a valid answer to `card`: a known value, and for a multi card at least one, none repeated. */
export function isValidAnswer(card: DealCard, value: AnswerValue): boolean {
  const known = new Set(card.answers.map((a) => a.value));
  if (card.multi) {
    const vs = typeof value === "string" ? [value] : [...value];
    return vs.length > 0 && new Set(vs).size === vs.length && vs.every((v) => known.has(v));
  }
  return typeof value === "string" && known.has(value);
}

const listWords = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The D3 sentence for an agreed answer. Throws on an answer the card doesn't offer. */
export function answerSentence(card: DealCard, value: AnswerValue): string {
  if (!isValidAnswer(card, value)) throw new Error(`Not an answer to ${card.key}.`);
  if (card.multi) {
    const vs = typeof value === "string" ? [value] : value;
    /* In catalogue order, whatever order they were ticked in. */
    const labels = card.answers.filter((a) => vs.includes(a.value)).map((a) => a.label);
    return `The content is posted on ${listWords(labels)}.`;
  }
  return card.answers.find((a) => a.value === value)!.sentence;
}
