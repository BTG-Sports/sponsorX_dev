/* --------------------------------------------------------------------------
   POL-FE-96 — one sale, as the athlete opens it (/athlete/sales/<id>), read
   as a journey of four steps:

     1  {Sponsor} pays          the sponsor's move
     2  You deliver it          your move: do it, then mark it delivered
     3  {Sponsor} checks it     24 hours to confirm or report a problem
     4  You get paid            your share becomes payable after the hold

   The owner found the old page (a status pill, a banner, a track, a card and
   a side card, all at once) "so confusing for a human". This file decides,
   from GET /sales/:id alone, where the sale is, whose turn it is and the
   words each step says; components/sale-wizard.tsx only walks them.

   Pure: no clock of its own (`now` is passed), no fetch. The rules behind
   the words (24 hours to confirm, silence confirms, the payout hold) are
   the ones seller-orders-live.ts already states, reused, not restated.
   -------------------------------------------------------------------------- */

import { CONFIRM_HOURS, confirmBy, datesText, dayOf, type ApiSellerOrder } from "@/lib/seller-orders-live";

export type StopKey = "pay" | "deliver" | "check" | "paid";
/** done · now (the step the sale is at) · later · stopped (the sale ended here) · off (after it ended: won't happen). */
export type StopStatus = "done" | "now" | "later" | "stopped" | "off";

export type JourneyStop = {
  key: StopKey;
  /** 1-based, as the page shows it. */
  n: number;
  title: string;
  /** The rail's label on a phone. */
  short: string;
  status: StopStatus;
  /** One short line under the rail's title: a date, or what it waits on ("" after the sale ended). */
  note: string;
};

/** Whose move it is, in the words the header's callout says. */
export type Turn = {
  who: "you" | "sponsor" | "btg" | "nobody";
  /** "Your move" · "Waiting on Acme" · "BTG is deciding" · "All done". */
  label: string;
  /** One plain sentence: what to do, or what happens next. */
  text: string;
  tone: "go" | "wait" | "win" | "ended";
};

export type Journey = {
  stops: JourneyStop[];
  /** The index the wizard opens on. */
  current: number;
  turn: Turn;
  /** Cancelled or refunded: the journey stopped at `current`. */
  ended: boolean;
  /** Every step done: the sponsor confirmed it. */
  complete: boolean;
};

export const STOP_KEYS: readonly StopKey[] = ["pay", "deliver", "check", "paid"];

/** Where the sale stands: the index of the step it's at. */
export function stopIndex(o: Pick<ApiSellerOrder, "state" | "markedAt" | "paidAt">): number {
  switch (o.state) {
    case "UNPAID": return 0;
    case "IN_DELIVERY": return 1;
    case "DELIVERED":
    case "PROBLEM": return 2;
    case "CONFIRMED": return 3;
    /* An ended sale stops at the step it got to. */
    case "REFUNDED": return o.markedAt ? 2 : o.paidAt ? 1 : 0;
    case "CANCELLED": return o.paidAt ? 1 : 0;
  }
}

const ended = (o: Pick<ApiSellerOrder, "state">) => o.state === "REFUNDED" || o.state === "CANCELLED";

/** The seller's turn on a problem the sponsor reported. */
export function answeringProblem(o: ApiSellerOrder): boolean {
  return (
    o.state === "PROBLEM" &&
    o.issue?.kind === "PROBLEM" &&
    o.issue.stage === "SELLER_TO_ANSWER" &&
    Boolean(o.canAnswerProblem ?? o.issue.sellerCanAnswer) &&
    Boolean(o.issue.sellerDueAt)
  );
}

/** The sponsor asked to cancel and it's the seller's to answer (the rule SellerCancelBox asks on). */
export function cancelAsked(o: Pick<ApiSellerOrder, "issue" | "canAnswerCancellation">): boolean {
  const i = o.issue;
  return Boolean(i?.kind === "CANCELLATION" && i.open && i.stage === "SELLER_TO_ANSWER" && (o.canAnswerCancellation ?? i.sellerCanAnswer) && i.sellerDueAt);
}

/** Whose move it is. */
export function turnOf(o: ApiSellerOrder, now: Date = new Date()): Turn {
  const s = o.sponsor.name;
  if (o.state === "REFUNDED") return { who: "nobody", label: "Refunded", text: `${s} got their money back for this, so there's no share to pay out.`, tone: "ended" };
  if (o.state === "CANCELLED") return { who: "nobody", label: "Cancelled", text: "This sale was cancelled. Nothing more to do here.", tone: "ended" };
  /* A sponsor's request to cancel comes first: it decides whether there's anything to deliver. */
  if (cancelAsked(o)) return { who: "you", label: "Your move", text: `${s} asked to cancel. Agree, or keep it and say why.`, tone: "go" };
  switch (o.state) {
    case "UNPAID":
      return { who: "sponsor", label: `Waiting on ${s}`, text: `${s} hasn't paid yet. Nothing for you to do — we email you the moment they pay.`, tone: "wait" };
    case "IN_DELIVERY": {
      if (o.issue?.kind === "CANCELLATION" && o.issue.open) {
        return { who: "btg", label: "BTG is deciding", text: `${s} asked to cancel, so BTG decides whether it goes ahead. You'll hear by email.`, tone: "wait" };
      }
      const due = o.redeliverOn ?? o.lastDate ?? o.line.endsOn;
      const late = o.overdue || (due ? new Date(`${due.slice(0, 10)}T23:59:59Z`).getTime() < now.getTime() : false);
      return {
        who: "you",
        label: "Your move",
        text: late
          ? `The date has passed. Mark it delivered as soon as it's done.`
          : `Deliver it ${o.redeliverOn ? `again on ${dayOf(o.redeliverOn)}` : `on ${datesText(o.line.dates)}`}, then mark it delivered here.`,
        tone: "go",
      };
    }
    case "DELIVERED":
      return { who: "sponsor", label: `Waiting on ${s}`, text: `${s} is checking it. No answer in ${CONFIRM_HOURS} hours counts as confirmed.`, tone: "wait" };
    case "PROBLEM": {
      if (answeringProblem(o)) return { who: "you", label: "Your move", text: `${s} reported a problem. Tell them how you'll fix it.`, tone: "go" };
      const stage = o.issue?.stage;
      if (stage === "SPONSOR_TO_ANSWER") return { who: "sponsor", label: `Waiting on ${s}`, text: `You answered. ${s} accepts or rejects your answer next.`, tone: "wait" };
      return { who: "btg", label: "BTG is deciding", text: "BTG is looking at the problem. You'll hear by email.", tone: "wait" };
    }
    case "CONFIRMED":
      return { who: "nobody", label: "All done", text: "Delivered and confirmed. Your share is on its way to Payouts.", tone: "win" };
  }
}

/** The four steps, with each one's status and its line on the rail. */
export function saleJourney(o: ApiSellerOrder, now: Date = new Date()): Journey {
  const s = o.sponsor.name;
  const at = stopIndex(o);
  const stop = ended(o);
  const complete = o.state === "CONFIRMED";
  const status = (i: number): StopStatus => {
    if (complete) return "done";
    if (i < at) return "done";
    if (i === at) return stop ? "stopped" : "now";
    return stop ? "off" : "later";
  };
  const endWord = o.state === "REFUNDED" ? "Refunded" : "Cancelled";
  const notes: Record<StopKey, (st: StopStatus) => string> = {
    pay: (st) => (st === "done" ? (o.paidAt ? `Paid ${dayOf(o.paidAt)}` : "Paid") : st === "stopped" ? endWord : st === "off" ? "" : "Not paid yet"),
    deliver: (st) =>
      st === "done"
        ? o.markedAt ? `Delivered ${dayOf(o.markedAt)}` : "Delivered"
        : st === "stopped"
          ? endWord
          : st === "off"
            ? ""
            : o.redeliverOn
            ? `Again on ${dayOf(o.redeliverOn)}`
            : `On ${datesText(o.line.dates)}`,
    check: (st) => {
      if (st === "done") return o.confirmedAt ? `Confirmed ${dayOf(o.confirmedAt)}` : "Confirmed";
      if (st === "stopped") return endWord;
      if (st === "off") return "";
      if (st === "now") return o.state === "PROBLEM" ? "Problem reported" : `${CONFIRM_HOURS} hours to check`;
      return `${CONFIRM_HOURS} hours after delivery`;
    },
    paid: (st) => (st === "done" ? "Share confirmed" : st === "stopped" ? "No payout" : st === "off" ? "" : "After it's confirmed"),
  };
  const titles: Record<StopKey, [string, string]> = {
    pay: [`${s} pays`, "Paid"],
    deliver: ["You deliver it", "Deliver"],
    check: [`${s} checks it`, "Checked"],
    paid: ["You get paid", "Get paid"],
  };
  const stops = STOP_KEYS.map<JourneyStop>((key, i) => {
    const st = status(i);
    return { key, n: i + 1, title: titles[key][0], short: titles[key][1], status: st, note: notes[key](st) };
  });
  return { stops, current: at, turn: turnOf(o, now), ended: stop, complete };
}

/** The sponsor's deadline to check it: the API's, else marked + 24 hours. Null before it's marked. */
export function checkDueAt(o: Pick<ApiSellerOrder, "markedAt" | "confirmDueAt">): string | null {
  return o.confirmDueAt ?? (o.markedAt ? confirmBy(o.markedAt) : null);
}

/** 0..1 of the sponsor's 24 hours still left (1 = just marked). */
export function checkLeft(o: Pick<ApiSellerOrder, "markedAt" | "confirmDueAt">, nowMs: number): number {
  const due = checkDueAt(o);
  if (!due) return 0;
  const end = new Date(due).getTime();
  const span = CONFIRM_HOURS * 3_600_000;
  return Math.max(0, Math.min(1, (end - nowMs) / span));
}

/** "13 h 20 m" / "45 m" / "0 m" — the countdown ring's figure. */
export function leftWords(dueIso: string, nowMs: number): string {
  const ms = Math.max(0, new Date(dueIso).getTime() - nowMs);
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** The burst word when the sale moves on while the page is open. Null when it didn't move forward. */
export function cheerFor(from: number, to: number, o: Pick<ApiSellerOrder, "sponsor" | "state">): { word: string; sub: string } | null {
  if (!(to > from) || o.state === "REFUNDED" || o.state === "CANCELLED") return null;
  if (to === 2) return { word: "Delivered!", sub: `${o.sponsor.name} has ${CONFIRM_HOURS} hours to check it.` };
  if (to === 3) return { word: "Confirmed!", sub: "Your share is on its way to Payouts." };
  if (to === 1) return { word: "Paid!", sub: "Time to deliver it." };
  return null;
}

/* ------------------------------------------------------- ?demo=sample */

/** The states `?demo=sample&as=` walks — one sale, every step it can be at. */
export const SAMPLE_STATES = ["unpaid", "deliver", "redeliver", "cancel-ask", "checking", "problem", "answered", "confirmed", "refunded", "cancelled"] as const;
export type SampleState = (typeof SAMPLE_STATES)[number];

export function sampleState(raw: string | string[] | undefined): SampleState {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return (SAMPLE_STATES as readonly string[]).includes(v) ? (v as SampleState) : "deliver";
}

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms).slice(0, 10);

type Issue = NonNullable<ApiSellerOrder["issue"]>;
const issue = (x: Partial<Issue> & Pick<Issue, "kind" | "stage" | "problem">): Issue => ({
  id: "sample-issue", open: true, sellerDueAt: null, sellerCanAnswer: false, sellerAnswer: null,
  sponsorDueAt: null, sponsorCanAnswer: false, sponsorAnswer: null, escalation: null, outcome: null, ...x,
});

/** A believable sale in state `as`, dated around `now`. Never sent anywhere: the sample's buttons do nothing. */
export function sampleSale(as: SampleState, now: Date = new Date()): ApiSellerOrder {
  const t = now.getTime();
  const first = day(t + 2 * 24 * HOUR);
  const last = day(t + 9 * 24 * HOUR);
  const cancellation = { canCancel: true, cancellationsLast90Days: 0, limit: 2, windowDays: 90, warning: "Cancelling counts toward 2 in 90 days.", refundCents: 90_000, cancelled: null };
  const base: ApiSellerOrder = {
    id: "sample",
    orderId: "sample-order",
    ref: "SX-24817",
    state: "IN_DELIVERY",
    orderState: "PAID",
    sponsor: { name: "Northside Fitness", contact: { name: "Dana Brooks", email: "dana@northsidefitness.example", phone: "(555) 014-2290" } },
    line: { title: "Youth basketball clinic", quantity: 2, unit: "session", unitPriceCents: 45_000, startsOn: first, endsOn: last, dates: [first, last], soldBy: "you", athlete: null },
    shareCents: 76_500,
    placedAt: iso(t - 3 * 24 * HOUR),
    paidAt: iso(t - 2 * 24 * HOUR),
    markedAt: null,
    markedBy: null,
    deliveryNote: null,
    proof: { photo: false, link: null },
    confirmDueAt: null,
    confirmedAt: null,
    confirmedBy: null,
    problem: null,
    resolution: null,
    overdue: false,
    canMarkDelivered: true,
    lastDate: last,
    redeliverOn: null,
    issue: null,
    canAnswerProblem: false,
    canAnswerCancellation: false,
    cancellation,
  };
  const marked: Partial<ApiSellerOrder> = {
    markedAt: iso(t - 9 * HOUR),
    markedBy: "you",
    deliveryNote: "Both clinics held at the rec center — 18 kids each day, Northside's banner up both days.",
    proof: { photo: true, link: null },
    confirmDueAt: iso(t + 15 * HOUR),
    canMarkDelivered: false,
    cancellation: null,
  };
  const problem = { text: "The second clinic finished 40 minutes early.", at: iso(t - 3 * HOUR) };
  switch (as) {
    case "unpaid":
      return { ...base, state: "UNPAID", orderState: "AWAITING_PAYMENT", paidAt: null, sponsor: { ...base.sponsor, contact: null }, canMarkDelivered: false, cancellation: null };
    case "deliver":
      return base;
    case "redeliver": {
      const again = day(t + 4 * 24 * HOUR);
      return {
        ...base,
        redeliverOn: again,
        issue: issue({
          kind: "PROBLEM", stage: "SETTLED", open: false, problem: { text: "Only one session happened.", at: iso(t - 30 * HOUR) },
          sellerAnswer: { answer: "DELIVER_AGAIN", words: `Deliver again on ${dayOf(again)}`, note: "Rescheduling the second session.", newDate: again, by: "you", at: iso(t - 20 * HOUR), proof: { photo: false, link: null } },
          outcome: { outcome: "REDELIVER", at: iso(t - 6 * HOUR), by: "SELLER_AND_SPONSOR", note: null },
        }),
      };
    }
    case "cancel-ask":
      return {
        ...base,
        canMarkDelivered: false,
        canAnswerCancellation: true,
        issue: issue({ kind: "CANCELLATION", stage: "SELLER_TO_ANSWER", problem: { text: "Our event moved, so we can't use the sessions.", at: iso(t - 5 * HOUR) }, sellerDueAt: iso(t + 43 * HOUR), sellerCanAnswer: true }),
      };
    case "checking":
      return { ...base, ...marked, state: "DELIVERED" };
    case "problem":
      return {
        ...base, ...marked, state: "PROBLEM", confirmDueAt: null, canAnswerProblem: true,
        problem: { reportedAt: problem.at, text: problem.text },
        issue: issue({ kind: "PROBLEM", stage: "SELLER_TO_ANSWER", problem, sellerDueAt: iso(t + 69 * HOUR), sellerCanAnswer: true }),
      };
    case "answered": {
      const again = day(t + 5 * 24 * HOUR);
      return {
        ...base, ...marked, state: "PROBLEM", confirmDueAt: null,
        problem: { reportedAt: problem.at, text: problem.text },
        issue: issue({
          kind: "PROBLEM", stage: "SPONSOR_TO_ANSWER", problem,
          sellerAnswer: { answer: "DELIVER_AGAIN", words: `Deliver again on ${dayOf(again)}`, note: "I'll run a full make-up session.", newDate: again, by: "you", at: iso(t - 2 * HOUR), proof: { photo: false, link: null } },
          sponsorDueAt: iso(t + 70 * HOUR),
        }),
      };
    }
    case "confirmed":
      return { ...base, ...marked, state: "CONFIRMED", confirmDueAt: null, confirmedAt: iso(t - 2 * HOUR), confirmedBy: "SPONSOR" };
    case "refunded":
      return {
        ...base, ...marked, state: "REFUNDED", confirmDueAt: null, shareCents: 0,
        resolution: { decision: "REFUNDED", note: "Only one of the two sessions took place.", at: iso(t - 5 * HOUR) },
      };
    case "cancelled":
      return {
        ...base, state: "CANCELLED", orderState: "CANCELLED", shareCents: 0, canMarkDelivered: false,
        cancellation: { ...cancellation, canCancel: false, cancelled: { by: "AGREED", at: iso(t - 6 * HOUR), note: null } },
      };
  }
}

