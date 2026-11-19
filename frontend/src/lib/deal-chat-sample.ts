import type { ApiDealAgreement, ApiDealCard, ApiDealChat, ApiDealMessage, ApiDealReviewItem, DealSide } from "@/lib/deal-chat";

/* --------------------------------------------------------------------------
   `?demo=sample` — Deal Chat with sample data, the way the order and sale
   pages have a sample: four chats, one in each stage a deal goes through,
   so the screens can be seen (and shown) before a real order opens a chat.
   Nothing on it is sent, picked, signed or called off.

   Built from `now`, so the times in it always read as recent.
   -------------------------------------------------------------------------- */

export const SAMPLE_NOTE = "This is sample data, so nothing was sent or changed.";

const YES_NO = [{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }];
const PERIOD = [{ value: "30_DAYS", label: "30 days" }, { value: "90_DAYS", label: "90 days" }, { value: "1_YEAR", label: "1 year" }];
const PLATFORMS = [{ value: "INSTAGRAM", label: "Instagram" }, { value: "TIKTOK", label: "TikTok" }, { value: "X", label: "X" }, { value: "YOUTUBE", label: "YouTube" }];

type Pick = string[] | null;
const same = (a: Pick, b: Pick) => !!a && !!b && a.length === b.length && a.every((v) => b.includes(v));

function cards(picks: Record<string, [Pick, Pick]>): ApiDealCard[] {
  const list: Omit<ApiDealCard, "sponsor" | "seller" | "agreed">[] = [
    { key: "APPROVAL_FIRST", question: "Does the Sponsor approve the content or plan before it goes live?", multi: false, answers: YES_NO },
    { key: "EXCLUSIVITY", question: "Exclusivity: no competing brand in the same category during the deal?", multi: false, answers: YES_NO },
    { key: "REUSE", question: "May the Sponsor reuse the content on its own channels?", multi: false, answers: YES_NO },
    { key: "PAID_ADS", question: "May the Sponsor use it in paid ads?", multi: false, answers: YES_NO },
    { key: "USAGE_PERIOD", question: "How long may the Sponsor use it?", multi: false, answers: PERIOD },
    { key: "PLATFORMS", question: "Which platforms?", multi: true, answers: PLATFORMS },
    { key: "CHANGES", question: "One round of changes included?", multi: false, answers: YES_NO },
  ];
  return list.map((c) => {
    const [sponsor, seller] = picks[c.key] ?? [null, null];
    return { ...c, sponsor, seller, agreed: same(sponsor, seller) };
  });
}

const ALL_AGREED: Record<string, [Pick, Pick]> = {
  APPROVAL_FIRST: [["YES"], ["YES"]], EXCLUSIVITY: [["NO"], ["NO"]], REUSE: [["YES"], ["YES"]], PAID_ADS: [["YES"], ["YES"]],
  USAGE_PERIOD: [["90_DAYS"], ["90_DAYS"]], PLATFORMS: [["INSTAGRAM", "TIKTOK"], ["INSTAGRAM", "TIKTOK"]], CHANGES: [["YES"], ["YES"]],
};

/** The four sample chats, as `side` reads them (null: as BTG does). */
export function sampleChats(now: number, side: DealSide | null): ApiDealChat[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const msg = (id: string, from: DealSide, body: string, minutesAgo: number, over: Partial<ApiDealMessage> = {}): ApiDealMessage => ({
    id, kind: "TEXT", side: from, exchangeId: null, body, createdAt: at(minutesAgo), byGuardian: false, state: "VISIBLE", keptBackReason: null,
    ...(side === null ? { heldReasons: [], reported: false, reportReason: null } : {}),
    ...over,
  });
  const base = { state: "OPEN" as const, forms: ["CONTENT"], sponsorName: "Northwind Sports Drinks", yourSide: side, mayAccept: side !== null, moneyNudge: null, calledOff: null, signingDeadline: null as string | null };
  const mine = (n: number) => (side === null ? 0 : n);

  /* 1 — talking: some answers agreed, one differing with an open offer, one not answered yet. */
  const talkingCards = cards({
    APPROVAL_FIRST: [["YES"], ["YES"]], EXCLUSIVITY: [["NO"], ["NO"]], REUSE: [["YES"], ["YES"]],
    PAID_ADS: [["YES"], ["NO"]], USAGE_PERIOD: side === "SELLER" ? [["90_DAYS"], null] : [null, ["90_DAYS"]],
    PLATFORMS: [["INSTAGRAM", "TIKTOK"], ["INSTAGRAM", "TIKTOK"]], CHANGES: [["YES"], ["YES"]],
  });
  const talking: ApiDealChat = {
    ...base, id: "sample-talking", orderId: "sample-order-7f3a9c21", orderRef: "SX-7F3A9C21", lineIds: ["sample-line-1"], sellerName: "Maya Chen",
    unread: mine(2), orderState: "IN_CHAT", signingDeadline: new Date(now + 8 * 86_400_000).toISOString(), agreement: null,
    status: {
      cards: talkingCards, agreedCount: talkingCards.filter((c) => c.agreed).length, cardCount: talkingCards.length,
      amount: { originalCents: 100_000, sponsorCents: null, sellerCents: null, agreed: false, agreedCents: null },
      openExchanges: [{ id: "sample-x1", cardKey: "PAID_ADS", waitingOn: "SPONSOR" }], heldForBtg: 0, allGreen: false,
      notYet: ["2 of 7 questions not agreed yet", "the final amount isn't confirmed by both sides yet", "1 offer still open"], turn: ["SPONSOR", "SELLER"], moneyFigures: [],
    },
    exchanges: [{ id: "sample-x1", cardKey: "PAID_ADS", state: "OPEN", startedBy: "SELLER", latestMessageId: "sample-m7", sponsorAccepted: false, sellerAccepted: true }],
    messages: [
      msg("sample-m1", "SPONSOR", "Hi Maya! Thanks for taking this on. We loved your spring training reel.", 26 * 60),
      msg("sample-m2", "SPONSOR", "The post is for our new citrus flavor. Launch week is the 10th.", 26 * 60 - 1),
      msg("sample-m3", "SELLER", "Thank you! Happy to do it. I answered the questions on my side.", 25 * 60),
      msg("sample-m4", "SELLER", "One thing: I'm not sure about paid ads. Let me make an offer.", 95),
      msg("sample-m5", "SELLER", "Yes to paid ads, but only on Instagram, and $200 more.", 94, { kind: "OFFER", exchangeId: "sample-x1" }),
      msg("sample-m6", "SPONSOR", "Instagram only is fine. Can we do $150?", 41, { kind: "REPLY", exchangeId: "sample-x1" }),
      msg("sample-m7", "SELLER", "$150 works if I approve each ad before it runs.", 12, { kind: "REPLY", exchangeId: "sample-x1" }),
    ],
    createdAt: at(27 * 60), lastActionAt: at(12),
  };

  /* 2 — everything agreed: the agreement is out, the sponsor has not signed yet. */
  const signCards = cards(ALL_AGREED);
  const sign: ApiDealChat = {
    ...base, id: "sample-sign", orderId: "sample-order-22b81d04", orderRef: "SX-22B81D04", lineIds: ["sample-line-2"], sellerName: "Riverside High Athletics",
    forms: ["PLACEMENT"], unread: mine(1), orderState: "IN_CHAT", signingDeadline: new Date(now + 2 * 86_400_000).toISOString(),
    agreement: { id: "sample-agreement", downloadPath: "/api/v1/deal-agreements/sample-agreement/download" },
    status: {
      cards: signCards, agreedCount: signCards.length, cardCount: signCards.length,
      amount: { originalCents: 240_000, sponsorCents: 240_000, sellerCents: 240_000, agreed: true, agreedCents: 240_000 },
      openExchanges: [], heldForBtg: 0, allGreen: true, notYet: [], turn: ["SPONSOR"], moneyFigures: [],
    },
    exchanges: [],
    messages: [
      msg("sample-s1", "SPONSOR", "Banner artwork is ready whenever you need it.", 3 * 24 * 60),
      msg("sample-s2", "SELLER", "Great. Everything on our side is answered and we've signed.", 5 * 60),
    ],
    createdAt: at(4 * 24 * 60), lastActionAt: at(5 * 60),
  };

  /* 3 — signed by both: the sponsor pays. */
  const paid: ApiDealChat = {
    ...sign, id: "sample-pay", orderId: "sample-order-90c4e1aa", orderRef: "SX-90C4E1AA", lineIds: ["sample-line-3"], sellerName: "Jordan Alvarez", forms: ["IN_PERSON"],
    unread: 0, orderState: "AWAITING_PAYMENT", signingDeadline: null,
    agreement: { id: "sample-agreement-signed", downloadPath: "/api/v1/deal-agreements/sample-agreement-signed/download" },
    status: { ...sign.status, amount: { originalCents: 60_000, sponsorCents: 65_000, sellerCents: 65_000, agreed: true, agreedCents: 65_000 }, turn: [] },
    messages: [
      msg("sample-p1", "SELLER", "Signed! See you at the store opening.", 2 * 24 * 60, { byGuardian: true }),
      msg("sample-p2", "SPONSOR", "Signed on our side too. Paying today.", 2 * 24 * 60 - 30),
    ],
    createdAt: at(6 * 24 * 60), lastActionAt: at(2 * 24 * 60 - 30),
  };

  /* 4 — called off. */
  const off: ApiDealChat = {
    ...talking, id: "sample-off", orderId: "sample-order-41d7a0be", orderRef: "SX-41D7A0BE", lineIds: ["sample-line-4"], sellerName: "Sam Okafor",
    state: "CLOSED", unread: 0, orderState: "CANCELLED", signingDeadline: null,
    calledOff: { side: "SELLER", reason: "My season schedule changed and I can't make the dates.", at: at(9 * 24 * 60) },
    status: { ...talking.status, openExchanges: [], turn: [] }, exchanges: [],
    messages: [msg("sample-o1", "SELLER", "I'm sorry, the dates moved on me. I have to call this one off.", 9 * 24 * 60 + 5)],
    createdAt: at(11 * 24 * 60), lastActionAt: at(9 * 24 * 60),
  };

  return [talking, sign, paid, off];
}

/** The sample agreement a sample chat opens. */
export function sampleAgreement(chat: ApiDealChat, now: number): ApiDealAgreement {
  const signed = chat.orderState !== "IN_CHAT";
  const cents = chat.status.amount.agreedCents ?? chat.status.amount.originalCents;
  const when = new Date(now - 5 * 3_600_000).toISOString();
  return {
    id: chat.agreement?.id ?? "sample-agreement", orderId: chat.orderId, orderRef: chat.orderRef, state: signed ? "SIGNED" : "OPEN", version: 1,
    forms: chat.forms, lineIds: chat.lineIds, amountCents: cents, originalAmountCents: chat.status.amount.originalCents,
    sponsorSignedAt: signed ? when : null, sellerSignedAt: when, signedByGuardian: false, signedAt: signed ? when : null,
    body: [
      `DEAL AGREEMENT (SAMPLE) — Order ${chat.orderRef}`,
      "",
      `Between ${chat.sponsorName} (the Sponsor) and ${chat.sellerName} (the Seller).`,
      "",
      "1. THE ORDER",
      "What was bought and its dates, as listed on the order.",
      "",
      "2. AGREED ANSWERS",
      ...chat.status.cards.map((c) => `- ${c.question} ${(c.sponsor ?? []).map((v) => c.answers.find((a) => a.value === v)?.label ?? v).join(", ")}`),
      "",
      "3. SPECIAL TERMS AGREED BETWEEN YOU",
      "Every offer both sides accepted in the chat, word for word.",
      "",
      "4. FINAL AMOUNT",
      `Amount to pay: $${(cents / 100).toLocaleString("en-US")}`,
      "",
      "The special terms are agreed between the Sponsor and the Seller. BTG runs the platform and does not enforce them.",
      "",
      "This is sample text. The real agreement is BTG's approved wording, filled in from your chat.",
    ].join("\n"),
    bodyHash: "sha256:sample", downloadPath: chat.agreement?.downloadPath ?? "", createdAt: when,
  };
}

/** BTG's desk, sampled: one held message, one reported. */
export function sampleReviews(now: number): ApiDealReviewItem[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  return [
    {
      messageId: "sample-held", chatId: "sample-talking", orderId: "sample-order-7f3a9c21", orderRef: "SX-7F3A9C21", kind: "TEXT", side: "SELLER",
      body: "Easier if you just text me, 555-014-2290, and we can sort payment on Venmo.", createdAt: at(38), state: "HELD",
      heldReasons: ["It looks like it has a phone number", "It mentions paying outside SponsorX"], reported: false, reportReason: null, reportedAt: null,
    },
    {
      messageId: "sample-reported", chatId: "sample-sign", orderId: "sample-order-22b81d04", orderRef: "SX-22B81D04", kind: "REPLY", side: "SPONSOR",
      body: "Take it or leave it. We have other schools lined up.", createdAt: at(4 * 60), state: "VISIBLE",
      heldReasons: [], reported: true, reportReason: "This felt like pressure.", reportedAt: at(3 * 60),
    },
  ];
}
