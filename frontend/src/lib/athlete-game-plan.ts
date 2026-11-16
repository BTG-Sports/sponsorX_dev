/* --------------------------------------------------------------------------
   The athlete home's game plan (POL-FE-81, 2026-11-16) — the words and
   states behind the step-by-step wizard at the top of /athlete
   (components/athlete-game-plan.tsx).

   The old home put eleven blocks on one screen and left the athlete to work
   out which mattered (owner: "so confusing for a human"). The game plan
   answers one question — what do I do next? — as the six steps from
   sign-up to paid, in the order the work runs:

     1 Profile      finish it (GET /athletes/me, completion)
     2 Agreements   your own rules + the Content Collaboration Agreement
     3 Payouts      the Stripe account (GET /payouts/account)
     4 Answer       offers, invitations, orders that wait on the athlete
     5 Deliver      deliverables due and marketplace sales to deliver
     6 Get paid     earnings and money ready to request

   A step the login doesn't have (a guardian has no payee; staff preview has
   no profile) is left out, not shown empty. Every figure is one the page
   already read (memory: stats-must-be-retrievable); these helpers only put
   them into words and decide which step opens first. Pure — the page and
   the tests call the same functions.
   -------------------------------------------------------------------------- */

import { confirmationsHref, outstandingWords, type Outstanding } from "./confirmations-live";

/**
 * done      a one-time step, finished
 * clear     a recurring step with nothing waiting right now
 * todo      needs the athlete
 * warn      needs the athlete, and something is late
 * guardian  waits on the athlete's guardian, not this login
 */
export type PlanState = "done" | "clear" | "todo" | "warn" | "guardian";

export type PlanIcon = "user" | "shield" | "card" | "inbox" | "calendar" | "wallet";

export type PlanStepMeta = {
  key: string;
  icon: PlanIcon;
  title: string;
  /** The stepper's label on a phone. */
  short: string;
  state: PlanState;
  /** The few words beside the step in the stepper ("2 waiting"). */
  status: string;
  /** One plain sentence: what this step is, right now. */
  lede: string;
  /** The one thing to do — a page to open. Null when the body holds the action. */
  cta: { label: string; href: string } | null;
};

export const isSettled = (s: PlanState) => s === "done" || s === "clear";
export const needsYou = (s: PlanState) => s === "todo" || s === "warn";

/** The step the wizard opens on: something late first, else the first that
 *  needs the athlete, else -1 (the finish). */
export function firstOpen(states: PlanState[]): number {
  const late = states.indexOf("warn");
  return late !== -1 ? late : states.findIndex(needsYou);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function usdWhole(cents: number): string {
  const v = cents / 100;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

/** The game plan's headline: how many steps need the athlete. */
export function planHeadline(states: PlanState[]): { title: string; sub: string } {
  const open = states.filter(needsYou).length;
  const late = states.some((s) => s === "warn");
  if (open === 0) {
    return states.some((s) => s === "guardian")
      ? { title: "Your guardian has the next move", sub: "Nothing needs you right now. The steps marked for your guardian are done from their own login." }
      : { title: "You're all caught up", sub: "Nothing needs you right now. New offers, invitations and due dates land here first." };
  }
  return {
    title: open === 1 ? "One thing needs you" : `${open} things need you`,
    sub: late
      ? "Something is late, so the plan opens there. Then work down the list — each step says what to do and opens the page where you do it."
      : "Work down the list from the top. Each step says what to do and opens the page where you do it.",
  };
}

/* ------------------------------------------------------------------ steps */

export function profileStep(p: { percent: number; done: number; total: number }): PlanStepMeta {
  const done = p.percent >= 100;
  const left = Math.max(0, p.total - p.done);
  return {
    key: "profile",
    icon: "user",
    title: "Finish your profile",
    short: "Profile",
    state: done ? "done" : "todo",
    status: done ? "Complete" : `${p.percent}% done`,
    lede: done
      ? "Your profile is complete. Sponsors see the whole you."
      : `${plural(left, "section")} left to fill in. A complete profile gets matched to sponsors sooner.`,
    cta: done ? { label: "View your profile", href: "/athlete/profile" } : { label: "Finish profile", href: "/athlete/profile/edit" },
  };
}

export function agreementsStep(items: Outstanding[], viewerIsGuardian: boolean): PlanStepMeta {
  const words = outstandingWords(items, viewerIsGuardian);
  const minorsOwnLogin = items.some((i) => i.byGuardian) && !viewerIsGuardian;
  const state: PlanState = items.length === 0 ? "done" : minorsOwnLogin ? "guardian" : "todo";
  return {
    key: "agreements",
    icon: "shield",
    title: "Confirm your agreements",
    short: "Agree",
    state,
    status: state === "done" ? "Confirmed" : state === "guardian" ? "Your guardian" : `${items.length} to confirm`,
    lede: words ? words.text : "Nothing left to confirm. You can read what you confirmed at any time.",
    cta:
      state === "done"
        ? { label: "See what you confirmed", href: "/athlete/confirmations" }
        : state === "guardian"
          ? null
          : { label: "Confirm now", href: confirmationsHref("/athlete") },
  };
}

export function payoutsStep(b: { show: boolean; guardianOnly?: boolean; needsInfo?: boolean; body?: string; readyLine?: string }): PlanStepMeta {
  const state: PlanState = !b.show ? "done" : b.guardianOnly ? "guardian" : "todo";
  return {
    key: "payouts",
    icon: "card",
    title: "Set up payouts",
    short: "Payouts",
    state,
    status: state === "done" ? "Ready" : state === "guardian" ? "Your guardian" : b.needsInfo ? "Needs info" : "Not set up",
    lede: state === "done" ? "Your payout account is ready. Money you earn goes straight to it through Stripe." : (b.body ?? ""),
    /* The Stripe button is in the step's body: it's a form, not a page. */
    cta: state === "done" ? { label: "Payout settings", href: "/athlete/money" } : null,
  };
}

export function answerStep(c: { invites: number; offers: number | null; orders: number | null }): PlanStepMeta {
  const offers = c.offers ?? 0;
  const orders = c.orders ?? 0;
  const total = c.invites + offers + orders;
  const parts = [
    orders ? plural(orders, "order") : null,
    offers ? plural(offers, "offer") : null,
    c.invites ? plural(c.invites, "invitation") : null,
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  /* Orders first: an order lapses in 48 hours. */
  const cta = orders
    ? { label: "Answer orders", href: "/athlete/sales" }
    : offers
      ? { label: "Open offers", href: "/athlete/offers" }
      : c.invites
        ? { label: "Open invitations", href: "/athlete/invitations" }
        : { label: "See invitations", href: "/athlete/invitations" };
  return {
    key: "answer",
    icon: "inbox",
    title: "Answer what's waiting",
    short: "Answer",
    state: total > 0 ? "todo" : "clear",
    status: total > 0 ? `${total} waiting` : "Nothing new",
    lede:
      total > 0
        ? `${list} ${total === 1 ? "needs" : "need"} a yes or no from you. Open one, read the terms, accept or decline.`
        : "No invitations or offers to answer right now. BTG sends them once your profile is live.",
    cta,
  };
}

export function deliverStep(c: { due: number; overdue: number; upcomingSales: number | null }): PlanStepMeta {
  const sales = c.upcomingSales ?? 0;
  const state: PlanState = c.overdue > 0 ? "warn" : c.due + sales > 0 ? "todo" : "clear";
  return {
    key: "deliver",
    icon: "calendar",
    title: "Deliver your content",
    short: "Deliver",
    state,
    status: c.overdue > 0 ? `${c.overdue} late` : c.due > 0 ? `${c.due} due` : sales > 0 ? `${plural(sales, "sale")} coming` : "Nothing due",
    lede:
      c.overdue > 0
        ? `${c.overdue} of ${c.due} are past their date — start with those. Post, film or show up, then send your proof.`
        : c.due > 0
          ? "Post, film or show up as agreed, then send your proof on the deliverable. Soonest date first."
          : sales > 0
            ? "A sponsor bought from your shop. The dates are below — deliver on the day."
            : "Deliverables show up here after you accept an invitation.",
    cta: c.due > 0 ? { label: "Open deliverables", href: "/athlete/deliverables" } : sales > 0 ? { label: "See sales", href: "/athlete/sales" } : { label: "All deliverables", href: "/athlete/deliverables" },
  };
}

export function moneyStep(c: { paidCents: number; owedCents: number; year: number; availableCents: number | null; canRequest: boolean }): PlanStepMeta {
  const ready = c.canRequest && (c.availableCents ?? 0) > 0;
  return {
    key: "money",
    icon: "wallet",
    title: "Get paid",
    short: "Get paid",
    state: ready ? "todo" : "clear",
    status: ready ? `${usdWhole(c.availableCents ?? 0)} ready` : c.paidCents > 0 ? `${usdWhole(c.paidCents)} paid` : "Nothing yet",
    lede: ready
      ? "You have money ready to request. Ask for a payout and it goes to your Stripe account."
      : c.owedCents > 0
        ? `${usdWhole(c.owedCents)} is on its way through BTG Finance — nothing for you to do.`
        : c.paidCents > 0
          ? `You've been paid ${usdWhole(c.paidCents)} in ${c.year}. Nothing is waiting.`
          : "Earnings start with your first Campaign Order. Deliver, and the money follows.",
    cta: ready ? { label: "Request a payout", href: "/athlete/money" } : { label: "See earnings", href: "/athlete/earnings" },
  };
}
