import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-FE-81 — the athlete home's game plan: the six steps from sign-up to
   paid, their states, and the one step the wizard opens on. Only the page's
   own figures go in; these check the words and decisions that come out.
   -------------------------------------------------------------------------- */

import {
  agreementsStep, answerStep, deliverStep, firstOpen, moneyStep, payoutsStep, planHeadline, profileStep,
} from "../src/lib/athlete-game-plan";

describe("each step's state, status and one thing to do", () => {
  it("profile: done at 100%, else the sections left and the edit page", () => {
    expect(profileStep({ percent: 100, done: 6, total: 6 })).toMatchObject({ state: "done", status: "Complete", cta: { href: "/athlete/profile" } });
    const p = profileStep({ percent: 67, done: 4, total: 6 });
    /* The profile page is the wizard; the full editor is never the way in. */
    expect(p).toMatchObject({ state: "todo", status: "67% done", cta: { label: "Finish profile", href: "/athlete/profile" } });
    expect(p.lede).toContain("2 sections left");
  });

  it("agreements: done, to do with the way back to the home, or the guardian's", () => {
    expect(agreementsStep([], false)).toMatchObject({ state: "done", status: "Confirmed" });
    const todo = agreementsStep([{ kind: "rules", required: true, byGuardian: false }, { kind: "collab", required: false, byGuardian: false }], false);
    expect(todo).toMatchObject({ state: "todo", status: "2 to confirm", cta: { label: "Confirm now" } });
    expect(todo.cta?.href).toContain("/athlete/confirmations");
    expect(todo.cta?.href).toContain("return=");
    /* A minor's own login: the guardian confirms, so no button. */
    expect(agreementsStep([{ kind: "collab", required: true, byGuardian: true }], false)).toMatchObject({ state: "guardian", cta: null });
    /* The guardian acting for them does it. */
    expect(agreementsStep([{ kind: "collab", required: true, byGuardian: true }], true).state).toBe("todo");
  });

  it("payouts: ready, the Stripe step (its button is in the body), or the guardian's", () => {
    expect(payoutsStep({ show: false, readyLine: "Payout account ready ✓" })).toMatchObject({ state: "done", status: "Ready" });
    expect(payoutsStep({ show: true, body: "Payouts go through Stripe." })).toMatchObject({ state: "todo", status: "Not set up", cta: null, lede: "Payouts go through Stripe." });
    expect(payoutsStep({ show: true, needsInfo: true }).status).toBe("Needs info");
    expect(payoutsStep({ show: true, guardianOnly: true }).state).toBe("guardian");
  });

  it("answer: everything that waits on a yes or no, orders first (they lapse in 48 hours)", () => {
    const a = answerStep({ invites: 1, offers: 2, orders: 1 });
    expect(a).toMatchObject({ state: "todo", status: "4 waiting", cta: { href: "/athlete/sales" } });
    expect(a.lede).toBe("1 order, 2 offers and 1 invitation need a yes or no from you. Open one, read the terms, accept or decline.");
    expect(answerStep({ invites: 0, offers: 1, orders: null }).cta?.href).toBe("/athlete/offers");
    expect(answerStep({ invites: 3, offers: null, orders: 0 }).cta?.href).toBe("/athlete/invitations");
    const clear = answerStep({ invites: 0, offers: null, orders: null });
    expect(clear).toMatchObject({ state: "clear", status: "Nothing new" });
    expect(clear.lede).not.toContain("waiting for your answer");
  });

  it("deliver: late wins, then due, then sales to deliver", () => {
    expect(deliverStep({ due: 6, overdue: 2, upcomingSales: 4 })).toMatchObject({ state: "warn", status: "2 late" });
    expect(deliverStep({ due: 3, overdue: 0, upcomingSales: null })).toMatchObject({ state: "todo", status: "3 due", cta: { href: "/athlete/deliverables" } });
    expect(deliverStep({ due: 0, overdue: 0, upcomingSales: 1 })).toMatchObject({ state: "todo", status: "1 sale coming", cta: { href: "/athlete/sales" } });
    expect(deliverStep({ due: 0, overdue: 0, upcomingSales: null }).state).toBe("clear");
  });

  it("get paid: a step only when there's money to request", () => {
    expect(moneyStep({ paidCents: 0, owedCents: 0, year: 2026, availableCents: 41_250, canRequest: true })).toMatchObject({
      state: "todo", status: "$412.50 ready", cta: { label: "Request a payout", href: "/athlete/money" },
    });
    const owed = moneyStep({ paidCents: 120_000, owedCents: 5_000, year: 2026, availableCents: 0, canRequest: false });
    expect(owed).toMatchObject({ state: "clear", status: "$1,200 paid" });
    expect(owed.lede).toBe("$50 is on its way through BTG Finance — nothing for you to do.");
  });
});

describe("where the wizard opens, and what it says on top", () => {
  it("opens on a late step first, else the first that needs the athlete; -1 (the finish) when none does", () => {
    expect(firstOpen(["done", "guardian", "todo", "warn"])).toBe(3);
    expect(firstOpen(["done", "guardian", "todo", "todo"])).toBe(2);
    expect(firstOpen(["done", "clear", "guardian"])).toBe(-1);
  });

  it("the headline counts what needs you", () => {
    expect(planHeadline(["done", "todo", "warn"]).title).toBe("2 things need you");
    expect(planHeadline(["done", "todo"]).title).toBe("One thing needs you");
    expect(planHeadline(["done", "clear"]).title).toBe("You're all caught up");
    expect(planHeadline(["done", "guardian"]).title).toBe("Your guardian has the next move");
  });
});
