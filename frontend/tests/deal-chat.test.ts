import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DealChat as DealChatContract } from "../../backend/src/contracts/deal-chat";
import { ADMIN_NAV, navFor } from "../src/lib/admin-nav";
import { mayUse } from "../src/lib/admin-access";
import {
  DEAL_LIVE_POLL_MS, DEAL_POLL_MS, agoShort, amountOpen, amountView, canWrite, cardRows, centsFromInput, chatPollDelay, chatRow, chatTitle, confirmationsFor, dayLabel,
  deadlineWords, dealInitials, dealSocketUrl,
  dealRefusal, dealStage, dealUsd, filterRows, inputFromCents, isReadOnly, messagesHref, nextMove, nextQuestion, offerButtons, orderHref, reviewRows,
  summaryRow, threadOf, unreadTotal, yourTurn,
  type ApiDealCard, type ApiDealChat, type ApiDealMessage, type ApiDealReviewItem, type ThreadMessage,
} from "../src/lib/deal-chat";
import { withMessages } from "../src/lib/deal-chat-nav";
import { groupNav } from "../src/lib/nav-groups";
import { sponsorBadge, sponsorStatus } from "../src/lib/order-automation-live";
import { paymentView } from "../src/lib/order-payment-live";
import { orderHero, orderJourney, whatNext } from "../src/lib/order-summary";
import { orderCard } from "../src/lib/orders-board";
import { canCancel, orderCopy, type ApiOrder } from "../src/lib/shop-live";
import { SPONSOR_NAV } from "../src/lib/sponsor-nav";

/* 2S4-FE-07 / -08 / -09 — Deal Chat's words and decisions (lib/deal-chat.ts),
   against the shapes the API answers with (backend/src/contracts/deal-chat.ts). */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-19T15:00:00.000Z");

const YES_NO = [{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }];
function card(key: string, sponsor: string[] | null, seller: string[] | null, over: Partial<ApiDealCard> = {}): ApiDealCard {
  const agreed = !!sponsor && !!seller && sponsor.length === seller.length && sponsor.every((v) => seller.includes(v));
  return { key, question: `Question ${key}?`, multi: false, answers: YES_NO, sponsor, seller, agreed, ...over };
}
function msg(id: string, side: "SPONSOR" | "SELLER", body: string, at: string, over: Partial<ApiDealMessage> = {}): ApiDealMessage {
  return { id, kind: "TEXT", side, exchangeId: null, body, createdAt: at, byGuardian: false, state: "VISIBLE", keptBackReason: null, ...over };
}
function chat(over: Partial<ApiDealChat> = {}, cards: ApiDealCard[] = [card("A", ["YES"], ["YES"]), card("B", null, ["NO"]), card("C", ["YES"], ["NO"])]): ApiDealChat {
  const agreedCount = cards.filter((c) => c.agreed).length;
  return {
    id: "dc_1", orderId: "ord_12345678abcd", orderRef: "SX-5678ABCD", state: "OPEN", forms: ["CONTENT"], lineIds: ["l1"],
    sponsorName: "Under Armour", sellerName: "Dana Brooks", yourSide: "SPONSOR", mayAccept: true, unread: 0,
    status: {
      cards, agreedCount, cardCount: cards.length,
      amount: { originalCents: 100_000, sponsorCents: null, sellerCents: null, agreed: false, agreedCents: null },
      openExchanges: [], heldForBtg: 0, allGreen: false, notYet: [`${cards.length - agreedCount} of ${cards.length} questions not agreed yet`], turn: ["SPONSOR", "SELLER"], moneyFigures: [],
    },
    moneyNudge: null, agreement: null, orderState: "IN_CHAT", signingDeadline: "2026-12-03T05:00:00.000Z", calledOff: null,
    exchanges: [], messages: [], createdAt: "2026-11-18T10:00:00.000Z", lastActionAt: "2026-11-19T14:00:00.000Z",
    ...over,
  };
}

describe("the wire shape", () => {
  it("the fixture these tests use is a DealChat as the API's own contract defines it", () => {
    const c = chat({
      exchanges: [{ id: "x1", cardKey: "C", state: "OPEN", startedBy: "SELLER", latestMessageId: "m2", sponsorAccepted: false, sellerAccepted: false }],
      messages: [msg("m1", "SPONSOR", "Hi", "2026-11-19T13:00:00.000Z"), msg("m2", "SELLER", "Instagram only", "2026-11-19T13:05:00.000Z", { kind: "OFFER", exchangeId: "x1" })],
    });
    expect(DealChatContract.safeParse(c).success).toBe(true);
  });
});

describe("money and names", () => {
  it("writes whole dollars without cents and keeps cents when there are some", () => {
    expect(dealUsd(115_000)).toBe("$1,150");
    expect(dealUsd(115_050)).toBe("$1,150.50");
  });
  it("reads the amount box: commas, a dollar sign and one or two decimals; nothing else", () => {
    expect(centsFromInput("1,150")).toBe(115_000);
    expect(centsFromInput("$1150.5")).toBe(115_050);
    expect(centsFromInput(" 1150.50 ")).toBe(115_050);
    for (const bad of ["", "abc", "12.345", "-5", "0", "1e3", "1150 dollars"]) expect(centsFromInput(bad), bad).toBeNull();
    expect(inputFromCents(115_000)).toBe("1150");
    expect(inputFromCents(115_050)).toBe("1150.50");
  });
  it("gives a name two letters, and each side the other's name as the chat's title", () => {
    expect(dealInitials("Under Armour")).toBe("UA");
    expect(dealInitials("Dana")).toBe("DA");
    expect(dealInitials("  ")).toBe("?");
    expect(chatTitle(chat())).toBe("Dana Brooks");
    expect(chatTitle(chat({ yourSide: "SELLER" }))).toBe("Under Armour");
    expect(chatTitle(chat({ yourSide: null }))).toBe("Under Armour and Dana Brooks");
  });
});

describe("who may do what", () => {
  it("BTG and the sponsor's analyst only read; a minor without the guardian still writes", () => {
    expect(isReadOnly(chat({ yourSide: null, mayAccept: false }))).toBe(true);
    expect(isReadOnly(chat({ yourSide: "SPONSOR", mayAccept: false }))).toBe(true);
    expect(isReadOnly(chat({ yourSide: "SELLER", mayAccept: false }))).toBe(false);
    expect(canWrite(chat({ yourSide: "SELLER", mayAccept: false }))).toBe(true);
  });
  it("nobody writes once the chat closed or the order ended", () => {
    expect(canWrite(chat({ state: "CLOSED" }))).toBe(false);
    for (const s of ["CANCELLED", "CLOSED", "REFUNDED"]) expect(canWrite(chat({ orderState: s })), s).toBe(false);
    expect(canWrite(chat({ orderState: "IN_DELIVERY" }))).toBe(true);
  });
});

describe("the checklist", () => {
  it("reads each card from the caller's side: agreed, differing, theirs to answer, or waiting", () => {
    const sponsor = cardRows(chat());
    expect(sponsor.map((r) => r.state)).toEqual(["agreed", "yours", "differ"]);
    expect(sponsor[2]).toMatchObject({ mineLabel: "Yes", theirsLabel: "No" });
    const seller = cardRows(chat({ yourSide: "SELLER" }));
    expect(seller.map((r) => r.state)).toEqual(["agreed", "theirs", "differ"]);
    expect(seller[2]).toMatchObject({ mineLabel: "No", theirsLabel: "Yes" });
  });
  it("for BTG nothing is 'yours': a half-answered card waits, an untouched one is open", () => {
    const rows = cardRows(chat({ yourSide: null }, [card("A", null, null), card("B", ["YES"], null)]));
    expect(rows.map((r) => r.state)).toEqual(["open", "theirs"]);
  });
  it("names several answers of a tick-all card, and marks a card with an open offer", () => {
    const multi = card("P", ["INSTAGRAM", "TIKTOK"], null, { multi: true, answers: [{ value: "INSTAGRAM", label: "Instagram" }, { value: "TIKTOK", label: "TikTok" }] });
    const c = chat({}, [multi, card("C", ["YES"], ["NO"])]);
    c.status.openExchanges = [{ id: "x1", cardKey: "C", waitingOn: "SPONSOR" }];
    const rows = cardRows(c);
    expect(rows[0]!.mineLabel).toBe("Instagram, TikTok");
    expect(rows[1]!.offerOpen).toBe(true);
  });
  it("asks the first unanswered question next, with its place in the list; never asks BTG", () => {
    expect(nextQuestion(chat())).toMatchObject({ index: 1, total: 3, row: { key: "B" } });
    expect(nextQuestion(chat({ yourSide: "SELLER" }))).toBeNull();
    expect(nextQuestion(chat({ yourSide: null }))).toBeNull();
  });
});

describe("the final amount", () => {
  it("pre-fills with the caller's own, else the other side's, else the original", () => {
    const c = chat();
    expect(amountView(c).prefillCents).toBe(100_000);
    c.status.amount.sellerCents = 115_000;
    expect(amountView(c)).toMatchObject({ prefillCents: 115_000, mismatch: false, theirsCents: 115_000, mineCents: null });
    c.status.amount.sponsorCents = 110_000;
    expect(amountView(c)).toMatchObject({ prefillCents: 110_000, mismatch: true });
    expect(amountView({ ...c, yourSide: "SELLER" })).toMatchObject({ mineCents: 115_000, theirsCents: 110_000 });
  });
  it("is open only while the order is in the chat and the two have not matched", () => {
    expect(amountOpen(chat())).toBe(true);
    expect(amountOpen(chat({ orderState: "AWAITING_PAYMENT" }))).toBe(false);
    const agreed = chat();
    agreed.status.amount = { originalCents: 100_000, sponsorCents: 115_000, sellerCents: 115_000, agreed: true, agreedCents: 115_000 };
    expect(amountOpen(agreed)).toBe(false);
  });
});

describe("where the deal stands", () => {
  const signed = { agreement: { id: "da_1", downloadPath: "/api/v1/deal-agreements/da_1/download" } };
  it("talking: counts what is agreed; it is the caller's when it is their turn", () => {
    expect(dealStage(chat())).toMatchObject({ key: "talking", tone: "you", text: "1 of 3 questions agreed." });
  });
  it("ready to sign: the caller's when their signature is missing, a wait once they signed", () => {
    const mine = chat(signed);
    mine.status.turn = ["SPONSOR"];
    expect(dealStage(mine)).toMatchObject({ key: "sign", tone: "you" });
    const theirs = chat(signed);
    theirs.status.turn = ["SELLER"];
    expect(dealStage(theirs)).toMatchObject({ key: "sign", tone: "wait", text: "You signed. Waiting for Dana Brooks to sign." });
  });
  it("signed by both: the sponsor pays, the seller waits for the payment", () => {
    expect(dealStage(chat({ ...signed, orderState: "AWAITING_PAYMENT" }))).toMatchObject({ key: "signed-pay", tone: "you" });
    expect(dealStage(chat({ ...signed, orderState: "AWAITING_PAYMENT", yourSide: "SELLER" })).text).toBe("Signed by both: waiting for the sponsor's payment.");
    expect(dealStage(chat({ ...signed, orderState: "PENDING_APPROVAL" })).key).toBe("signed-held");
  });
  it("called off: says who, and that nothing was charged", () => {
    const off = chat({ state: "CLOSED", orderState: "CANCELLED", calledOff: { side: "SELLER", reason: "Dates clash", at: "2026-11-19T12:00:00.000Z" } });
    expect(dealStage(off)).toMatchObject({ key: "off", text: "Dana Brooks called the deal off. The order is cancelled and nothing was charged." });
    expect(dealStage({ ...off, yourSide: "SELLER" }).text).toMatch(/^You called the deal off/);
  });
  it("paid, and ended orders", () => {
    expect(dealStage(chat({ ...signed, orderState: "IN_DELIVERY" })).key).toBe("paid");
    expect(dealStage(chat({ orderState: "CANCELLED", state: "CLOSED" })).key).toBe("ended");
  });
});

describe("the one next move", () => {
  it("questions first, then an offer waiting, then differing answers, then the amount", () => {
    expect(nextMove(chat())).toBe("Your turn: answer 1 question.");
    const offer = chat({}, [card("A", ["YES"], ["YES"]), card("C", ["YES"], ["NO"])]);
    offer.status.openExchanges = [{ id: "x1", cardKey: "C", waitingOn: "SPONSOR" }];
    expect(nextMove(offer)).toBe("Your turn: an offer is waiting for your answer.");
    expect(nextMove(chat({}, [card("C", ["YES"], ["NO"])]))).toBe("Your answers differ on 1 question. Change one, or make an offer.");
    expect(nextMove(chat({}, [card("A", ["YES"], ["YES"])]))).toBe("Your turn: confirm the final amount.");
  });
  it("a minor is told the amount waits for the guardian; otherwise it waits for the other side", () => {
    expect(nextMove(chat({ yourSide: "SELLER", mayAccept: false }, [card("A", ["YES"], ["YES"])]))).toBe("The final amount waits for your parent or guardian.");
    const waiting = chat({}, [card("A", ["YES"], ["YES"])]);
    waiting.status.amount.sponsorCents = 100_000;
    expect(nextMove(waiting)).toBe("Waiting for Dana Brooks.");
  });
  it("is the caller's turn only on an open chat they are a side of", () => {
    expect(yourTurn(chat())).toBe(true);
    expect(yourTurn(chat({ yourSide: null }))).toBe(false);
    expect(yourTurn(chat({ orderState: "CANCELLED" }))).toBe(false);
  });
});

describe("the thread", () => {
  const base = chat({
    exchanges: [{ id: "x1", cardKey: "C", state: "OPEN", startedBy: "SELLER", latestMessageId: "m5", sponsorAccepted: false, sellerAccepted: true }],
    messages: [
      msg("m1", "SPONSOR", "Hi Dana", "2026-11-18T15:00:00.000Z"),
      msg("m2", "SPONSOR", "Looking forward to it", "2026-11-18T15:02:00.000Z"),
      msg("m3", "SELLER", "Me too", "2026-11-18T15:20:00.000Z"),
      msg("m4", "SELLER", "Instagram only, and $200 more", "2026-11-19T14:00:00.000Z", { kind: "OFFER", exchangeId: "x1" }),
      msg("m5", "SELLER", "Or $150", "2026-11-19T14:01:00.000Z", { kind: "REPLY", exchangeId: "x1" }),
    ],
  });
  const messages = (c: ApiDealChat) => threadOf(c, NOW).filter((i): i is ThreadMessage => i.type === "message");

  it("splits the days and runs one side's quick messages together", () => {
    const items = threadOf(base, NOW);
    expect(items.filter((i) => i.type === "day")).toHaveLength(2);
    const m = messages(base);
    expect(m.map((x) => [x.id, x.mine, x.first, x.last])).toEqual([
      ["m1", true, true, false],
      ["m2", true, false, true],
      ["m3", false, true, true],
      ["m4", false, true, true],
      ["m5", false, true, true],
    ]);
  });
  it("hangs the offer's buttons on its latest message only, with the question it is about", () => {
    const m = messages(base);
    expect(m[3]!.latestOfOffer).toBe(false);
    expect(m[4]!.latestOfOffer).toBe(true);
    expect(m[3]!.exchange).toMatchObject({ about: "Question C?", theyAccepted: true, youAccepted: false });
  });
  it("puts the sponsor on the right for BTG, with each side's name", () => {
    const m = messages({ ...base, yourSide: null });
    expect(m[0]).toMatchObject({ mine: true, author: "Under Armour" });
    expect(m[2]).toMatchObject({ mine: false, author: "Dana Brooks" });
  });
  it("offers Reply, Accept and Decline to a side; no Accept to a minor, nothing while it waits for BTG or once it ended", () => {
    const offer = messages(base)[4]!.exchange!;
    expect(offerButtons(base, offer)).toMatchObject({ open: true, canAccept: true, canReply: true, canDecline: true, note: "Dana Brooks accepted. It is agreed when you accept too." });
    const minor = { ...base, yourSide: "SELLER" as const, mayAccept: false };
    expect(offerButtons(minor, messages(minor)[4]!.exchange!)).toMatchObject({ canAccept: false, canReply: true, note: "Only your parent or guardian can accept an offer." });
    expect(offerButtons(base, { ...offer, held: true })).toMatchObject({ open: false, canAccept: false });
    expect(offerButtons(base, { ...offer, state: "AGREED" }).note).toMatch(/word for word/);
    expect(offerButtons({ ...base, yourSide: null }, offer)).toMatchObject({ open: false, note: "Accepted by Dana Brooks." });
    expect(offerButtons({ ...base, orderState: "CANCELLED" }, offer).open).toBe(false);
  });
  it("never offers Accept twice", () => {
    const mine = { ...base, exchanges: [{ ...base.exchanges[0]!, sponsorAccepted: true, sellerAccepted: false }] };
    expect(offerButtons(mine, messages(mine)[4]!.exchange!)).toMatchObject({ canAccept: false, note: "You accepted. Waiting for Dana Brooks." });
  });
});

describe("time", () => {
  it("names today and yesterday, then the day", () => {
    const local = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
    const now = new Date(2026, 10, 19, 15);
    expect(dayLabel(local(19, 9), now)).toBe("Today");
    expect(dayLabel(local(18, 23), now)).toBe("Yesterday");
    expect(dayLabel(local(12, 9), now)).toBe("Thu, Nov 12");
  });
  it("says how long ago the way a chat list does", () => {
    const ago = (ms: number) => agoShort(new Date(NOW.getTime() - ms).toISOString(), NOW);
    expect([ago(20_000), ago(5 * 60_000), ago(9 * 3_600_000), ago(3 * 86_400_000)]).toEqual(["now", "5m", "9h", "3d"]);
  });
  it("counts the days left to sign, and flags the last two", () => {
    expect(deadlineWords(null, NOW)).toBeNull();
    expect(deadlineWords("2026-11-25T15:00:00.000Z", NOW)).toMatchObject({ urgent: false });
    expect(deadlineWords("2026-11-25T15:00:00.000Z", NOW)!.text).toMatch(/6 days left$/);
    expect(deadlineWords("2026-11-21T15:00:00.000Z", NOW)).toMatchObject({ urgent: true });
    expect(deadlineWords("2026-11-19T10:00:00.000Z", NOW)!.text).toMatch(/today$/);
  });
});

describe("the list of chats", () => {
  it("a row previews the last message, said from the reader's side, and skips a kept-back one", () => {
    const c = chat({ unread: 2, messages: [msg("m1", "SPONSOR", "Hi  Dana", "2026-11-19T13:00:00.000Z"), msg("m2", "SELLER", "x", "2026-11-19T13:01:00.000Z", { state: "KEPT_BACK" })] });
    expect(chatRow(c)).toMatchObject({ title: "Dana Brooks", preview: "You: Hi Dana", unread: 2, yourTurn: true, ended: false, agreementId: null });
    expect(chatRow({ ...c, yourSide: "SELLER" }).preview).toBe("Hi Dana");
    expect(chatRow({ ...c, yourSide: null }).preview).toBe("Under Armour: Hi Dana");
  });
  it("past the talking stage a row says where the deal stands instead", () => {
    const c = chat({ orderState: "AWAITING_PAYMENT", agreement: { id: "da_1", downloadPath: "x" }, messages: [msg("m1", "SELLER", "ok", "2026-11-19T13:00:00.000Z")] });
    expect(chatRow(c).preview).toBe("Both of you signed. Pay on the order page to lock in the dates.");
    expect(chatRow(c).agreementId).toBe("da_1");
  });
  it("filters by unread, by your turn and by the search box, newest first", () => {
    const rows = [
      { ...chatRow(chat({ id: "a", unread: 0, lastActionAt: "2026-11-19T10:00:00.000Z" })), yourTurn: false },
      chatRow(chat({ id: "b", unread: 3, lastActionAt: "2026-11-19T12:00:00.000Z", sellerName: "Riverside High" })),
    ];
    expect(filterRows(rows, "all", "").map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterRows(rows, "unread", "").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "turn", "").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "all", "riverside").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "all", "sx-5678").map((r) => r.id)).toEqual(["b", "a"]);
    expect(unreadTotal(rows)).toBe(3);
  });
  it("a chat that could not be read in full still gets a row, with nothing guessed", () => {
    const row = summaryRow({ id: "z", orderId: "o", orderRef: "SX-AAAA1111", state: "CLOSED", forms: [], dealAgreementId: "da_9", unread: 0, lastActionAt: "2026-11-01T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z" });
    expect(row).toMatchObject({ title: "Order SX-AAAA1111", ended: true, agreementId: "da_9", yourTurn: false });
  });
});

describe("signing", () => {
  it("asks each side for its own confirmations: the sponsor's one, the athlete's two, the guardian's three, the team's in its own words", () => {
    expect(confirmationsFor("SPONSOR", { portal: "sponsor", guardian: false })).toHaveLength(1);
    expect(confirmationsFor("SPONSOR", { portal: "sponsor", guardian: false })[0]).toMatch(/restricted category/);
    const athlete = confirmationsFor("SELLER", { portal: "athlete", guardian: false });
    expect(athlete).toHaveLength(2);
    expect(athlete[0]).toMatch(/^I will tag the sponsor/);
    const guardian = confirmationsFor("SELLER", { portal: "athlete", guardian: true });
    expect(guardian).toHaveLength(3);
    expect(guardian[2]).toBe("As the parent or guardian, I consent to this deal.");
    expect(confirmationsFor("SELLER", { portal: "property", guardian: false })[0]).toMatch(/^The team will tag/);
  });
});

describe("where things open", () => {
  it("each portal's Messages page, the order for those who can open it", () => {
    expect(messagesHref("sponsor", "dc 1")).toBe("/sponsor/messages?chat=dc%201");
    expect(messagesHref("athlete")).toBe("/athlete/messages");
    expect(messagesHref("admin", "x")).toBe("/admin/deal-chats?chat=x");
    expect(orderHref("sponsor", "o1")).toBe("/sponsor/orders/o1");
    expect(orderHref("admin", "o1")).toBe("/admin/marketplace/orders/o1");
    expect(orderHref("athlete", "o1")).toBeNull();
    expect(orderHref("property", "o1")).toBeNull();
  });
});

describe("refusals", () => {
  it("says the API's own sentence for a 409 or a 422, and plain words for the rest", () => {
    expect(dealRefusal(409, { error: { message: "Both sides agreed this answer, so it can't be changed." } }, "x")).toBe("Both sides agreed this answer, so it can't be changed.");
    expect(dealRefusal(422, { error: { message: "Write something first." } }, "x")).toBe("Write something first.");
    expect(dealRefusal(403, { error: { message: "forbidden: dealChat write" } }, "x")).toBe("You can't do that in this chat.");
    expect(dealRefusal(0, null, "x")).toMatch(/couldn't reach SponsorX/);
    expect(dealRefusal(401, null, "x")).toMatch(/Sign in again/);
    expect(dealRefusal(500, null, "Your message wasn't sent")).toBe("Your message wasn't sent (500).");
  });
});

describe("BTG's desk", () => {
  const item = (id: string, over: Partial<ApiDealReviewItem>): ApiDealReviewItem => ({
    messageId: id, chatId: "dc_1", orderId: "o", orderRef: "SX-1", kind: "TEXT", side: "SELLER", body: "call me", createdAt: "2026-11-19T10:00:00.000Z",
    state: "VISIBLE", heldReasons: [], reported: false, reportReason: null, reportedAt: null, ...over,
  });
  it("lists held messages before reported ones, each with why", () => {
    const rows = reviewRows([
      item("r1", { reported: true, reportReason: "Rude" }),
      item("h1", { state: "HELD", heldReasons: ["Looks like a phone number"] }),
    ]);
    expect(rows.map((r) => [r.messageId, r.why, r.reasons])).toEqual([["h1", "held", ["Looks like a phone number"]], ["r1", "reported", ["Rude"]]]);
  });
  it("the desk is in the admin's Marketplace group, A to Z, for BTG admins only", () => {
    const group = groupNav(ADMIN_NAV).groups.find((g) => g.label === "Marketplace")!;
    expect(group.items.map((i) => i.label)).toEqual(["All orders", "Deal chats", "Delivery issues", "Marketplace", "Restricted words"]);
    expect(mayUse("/admin/deal-chats", ["BTG_ADMIN"])).toBe(true);
    expect(mayUse("/admin/deal-chats/review", ["SUPER_ADMIN"])).toBe(true);
    for (const role of ["SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE"]) {
      expect(mayUse("/admin/deal-chats", [role]), role).toBe(false);
      expect(navFor([role]).some((n) => n.href === "/admin/deal-chats"), role).toBe(false);
    }
  });
});

describe("the Messages link", () => {
  it("is always in the sidebar, on its own under Dashboard and never inside Marketplace (owner, 2026-11-19)", () => {
    const nav = withMessages(SPONSOR_NAV, "sponsor");
    const { top, groups } = groupNav(nav);
    expect(top.map((i) => i.label)).toEqual(["Dashboard", "Messages"]);
    expect(groups.find((g) => g.label === "Marketplace")!.items.map((i) => i.label)).toEqual(["Cart", "Orders", "Packages", "Shop"]);
    expect(nav.find((n) => n.label === "Messages")).toMatchObject({ href: "/sponsor/messages", icon: "chat" });
    expect(nav.find((n) => n.label === "Messages")!.group).toBeUndefined();
    /* The portal's own array is never touched, and asked twice the link is still there once. */
    expect(SPONSOR_NAV.some((n) => n.label === "Messages")).toBe(false);
    expect(withMessages(nav, "sponsor")).toBe(nav);
  });
  it("sits straight after Dashboard in the property portal's flat list too", () => {
    const flat = [
      { href: "/property", label: "Dashboard", icon: "grid" as const },
      { href: "/property/sales", label: "Orders", icon: "box" as const },
      { href: "/property/earnings", label: "Earnings", icon: "wallet" as const },
    ];
    expect(withMessages(flat, "property").map((n) => n.label)).toEqual(["Dashboard", "Messages", "Orders", "Earnings"]);
  });
  it("every portal layout shows the link to everyone, asks for its own people's chats only, and mounts the round button only when there are some", () => {
    for (const portal of ["sponsor", "athlete", "property"]) {
      const layout = src(`app/(app)/${portal}/layout.tsx`);
      expect(layout, portal).toContain(`portalChats("${portal}", actor)`);
      expect(layout, portal).toContain("chats.length > 0 && <ChatDock");
      expect(layout, portal).toContain(`, "${portal}")}`);
      expect(layout, portal).toContain("nav={withMessages(");
    }
    /* The page's empty state promises nothing about when a chat opens: true with the DEAL_CHAT switch on or off. */
    expect(src("components/deal-chat/chat-list.tsx")).not.toMatch(/as soon as/);
    /* BTG staff previewing a portal are never handed BTG's own every-chat list under a sponsor's chrome. */
    expect(src("server/deal-chat.ts")).toMatch(/if \(!PORTAL_ROLES\[portal\]\.some\(\(r\) => actor\.roles\.includes\(r\)\)\) return \[\];/);
  });
});

describe("an order in the Deal Chat stage (IN_CHAT)", () => {
  const order = {
    id: "ord_12345678abcd", state: "IN_CHAT", totalCents: 105_000, decidedBy: null, decisionNotes: null, decidedAt: null, contractedAt: null, awaitingPaymentAt: null, paidAt: null,
    createdAt: "2026-11-18T10:00:00.000Z", deadlineAt: "2026-12-03T05:00:00.000Z", waitingOn: "DEAL_CHAT", cancelReason: null, sellerApprovals: [],
    lines: [{ id: "l1", title: "Instagram post", seller: { type: "ATHLETE", id: "a1", name: "Dana Brooks" }, startsOn: "2026-12-10", endsOn: "2026-12-10", quantity: 1, lineTotalCents: 100_000 }],
  } as unknown as ApiOrder;

  it("has its own words everywhere a sponsor reads an order's state", () => {
    expect(orderCopy("IN_CHAT")).toMatchObject({ label: "Agreeing the deal", tone: "primary" });
    expect(orderHero(order, "not-open", true)).toMatchObject({ mood: "placed", title: "Your order is placed" });
    expect(orderHero(order, "not-open", false)).toMatchObject({ mood: "wait", title: "Settle the deal in the chat" });
    expect(orderJourney(order, "not-open", null).stops.map((s) => [s.label, s.state, s.note])[1]).toEqual(["Approved", "now", "In the deal chat"]);
    expect(whatNext(order, "not-open")[0]!.title).toBe("You and the seller agree the deal");
    expect(sponsorBadge(order, "not-open", NOW)).toMatchObject({ label: "Agreeing the deal" });
    expect(sponsorStatus(order, "not-open", NOW)).toMatchObject({ tag: "Agreeing the deal", pay: false });
  });
  it("cannot be paid or cancelled from the order page: the agreement comes first, and calling off is in the chat", () => {
    const pay = paymentView("IN_CHAT", null, { supportEmail: null });
    expect(pay).toMatchObject({ kind: "not-open", cta: null });
    expect(pay.note).toMatch(/both signed the agreement/);
    expect(canCancel("IN_CHAT")).toBe(false);
  });
  it("is the sponsor's move on the orders list, with the signing date", () => {
    const c = orderCard(order, NOW);
    expect(c).toMatchObject({ label: "Agreeing the deal", move: true });
    expect(c.next.title).toBe("Settle the deal with Dana Brooks");
    expect(c.due?.text).toMatch(/^Sign /);
  });
  it("words the chat's two endings", () => {
    const off = { ...order, state: "CANCELLED", cancelReason: "CALLED_OFF" } as unknown as ApiOrder;
    expect(sponsorBadge(off, "none", NOW)).toMatchObject({ label: "Deal called off" });
    expect(sponsorStatus(off, "none", NOW)?.title).toMatch(/called off in the chat/);
    const late = { ...order, state: "CANCELLED", cancelReason: "NOT_SIGNED" } as unknown as ApiOrder;
    expect(sponsorStatus(late, "none", NOW)?.title).toMatch(/wasn’t signed by both sides in time/);
  });
});

describe("the server actions file", () => {
  it("exports only async functions (anything else fails every action in it at run time)", () => {
    const file = src("server/deal-chat-actions.ts");
    expect(file.startsWith('"use server";')).toBe(true);
    const exports = [...file.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]!);
    expect(exports.length).toBeGreaterThan(10);
    for (const e of exports) expect(e, e).toMatch(/^async function /);
  });
  it("forwards the signer's address and browser with a signature (§12)", () => {
    expect(src("server/deal-chat-actions.ts")).toMatch(/edgeHeadersFrom\(await headers\(\), \{ signer: true \}\)/);
  });
});

describe("the sample (?demo=sample)", () => {
  it("is four chats the API's own contract accepts, one in each stage, read from either side or as BTG", async () => {
    const { sampleChats, sampleAgreement, sampleReviews } = await import("../src/lib/deal-chat-sample");
    const { DealChatReviewItem } = await import("../../backend/src/contracts/deal-chat");
    const { DealAgreement } = await import("../../backend/src/contracts/deal-agreement");
    for (const side of ["SPONSOR", "SELLER", null] as const) {
      const chats = sampleChats(NOW.getTime(), side);
      expect(chats.map((c) => dealStage(c).key), String(side)).toEqual(["talking", "sign", "signed-pay", "off"]);
      for (const c of chats) {
        const parsed = DealChatContract.safeParse(c);
        expect(parsed.success, `${side} ${c.id} ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`).toBe(true);
        expect(c.status.agreedCount).toBe(c.status.cards.filter((k) => k.agreed).length);
      }
      expect(DealAgreement.safeParse(sampleAgreement(chats[1]!, NOW.getTime())).success).toBe(true);
    }
    /* Each side has a question of its own to answer in the first chat, so the question card shows for both. */
    expect(nextQuestion(sampleChats(NOW.getTime(), "SPONSOR")[0]!)?.row.key).toBe("USAGE_PERIOD");
    expect(nextQuestion(sampleChats(NOW.getTime(), "SELLER")[0]!)?.row.key).toBe("USAGE_PERIOD");
    for (const r of sampleReviews(NOW.getTime())) expect(DealChatReviewItem.safeParse(r).success).toBe(true);
  });
  it("sends, picks and signs nothing: the open chat's hook refuses every write in a sample", () => {
    const hook = src("components/deal-chat/use-deal-chat.ts");
    expect(hook).toContain("if (sample) return { ok: false, message: SAMPLE_NOTE };");
    expect(hook).toMatch(/useEffect\(\(\) => \{\n\s+if \(sample\) return;/);
  });
});

describe("the live socket (owner, 2026-11-19)", () => {
  it("hands a browser the API's public address, a local run its own machine's, and never the private one", () => {
    expect(dealSocketUrl({ API_PUBLIC_URL: "https://api.sponsorx.example/" })).toBe("https://api.sponsorx.example");
    expect(dealSocketUrl({ API_PUBLIC_URL: "https://api.sponsorx.example", API_URL: "http://api.railway.internal:4000" })).toBe("https://api.sponsorx.example");
    expect(dealSocketUrl({ API_URL: "http://localhost:4000" })).toBe("http://localhost:4000");
    expect(dealSocketUrl({})).toBe("http://localhost:4000");
    /* The private address the web server uses is never given to a browser. */
    expect(dealSocketUrl({ API_URL: "http://api.railway.internal:4000" })).toBeNull();
    expect(dealSocketUrl({ API_URL: "http://localhost.evil.example:4000" })).toBeNull();
    expect(dealSocketUrl({ API_PUBLIC_URL: "not a url" })).toBeNull();
  });
  it("is a speed-up, not a requirement: without it the open chat asks every few seconds, with it only as a safety net", () => {
    expect(chatPollDelay(false)).toBe(DEAL_POLL_MS);
    expect(chatPollDelay(true)).toBe(DEAL_LIVE_POLL_MS);
    expect(DEAL_LIVE_POLL_MS).toBeGreaterThan(DEAL_POLL_MS);
    const hook = src("components/deal-chat/use-deal-chat.ts");
    expect(hook).toContain("chatPollDelay(dealSocketLive())");
    /* The socket only says which chat moved; the chat itself is read again through the ordinary action. */
    expect(hook).toMatch(/onDealSocket\(\(e\) => \{\n\s+if \(touches\(e, id\)\) void loop\(\);/);
    const socket = src("components/deal-chat/deal-socket.ts");
    expect(socket).not.toMatch(/setChat|loadDealChatAction|sendDealMessageAction/);
    expect([...socket.matchAll(/from "@\/server\/[^"]+"/g)]).toHaveLength(1);
  });
  it("a sample never opens it", () => {
    const hook = src("components/deal-chat/use-deal-chat.ts");
    const effect = hook.slice(hook.indexOf("export function useDealChat"));
    expect(effect.indexOf("if (sample) return;")).toBeLessThan(effect.indexOf("onDealSocket("));
    expect(src("components/deal-chat/messenger.tsx")).toContain("useChatRows(sample ? sample.map(chatRow) : initialRows, !sample)");
  });
});
