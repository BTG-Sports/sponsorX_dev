import { describe, expect, it } from "vitest";

import {
  PAYMENTS_OPEN_SOON, PROVIDER_NOT_SET_UP, REASON_MAX, REASON_MIN, confirmWords, historyLine, providerLabel, reasonProblem, switchRefusal, switchStamp,
  switchWords, type ApiPaymentSwitch,
} from "@/lib/payment-switch-live";

/* POL-FE-36 — BTG's payments switch (backend POL-BE-36): the API's answer in
   words, the confirm step, the reason's check, the history lines, and what
   a refused change reads as. Every name here is the API's own. */

const base: ApiPaymentSwitch = {
  on: true,
  open: true,
  provider: "stripe",
  canTurnOn: true,
  changed: { at: "2026-10-30T14:05:00.000Z", by: "finance@btg.example", reason: "Stripe live keys verified; go-live approved." },
  history: [
    { at: "2026-10-30T14:05:00.000Z", on: true, reason: "Stripe live keys verified; go-live approved.", by: "finance@btg.example" },
    { at: "2026-10-29T09:40:00.000Z", on: false, reason: "Webhook failing — closing while we look.", by: null },
  ],
};
const sw = (over: Partial<ApiPaymentSwitch> = {}): ApiPaymentSwitch => ({ ...base, ...over });

describe("switchWords", () => {
  it("open: the switch is on and Railway names a provider — the next step is Turn off", () => {
    const w = switchWords(sw());
    expect(w.state).toBe("open");
    expect(w.chip).toEqual({ label: "Open", tone: "accent" });
    expect(w.headline).toBe("Payments are open");
    expect(w.switchLine).toBe("BTG's switch: on");
    expect(w.providerLine).toBe("Provider: Stripe");
    expect(w.next).toEqual({ open: false, label: "Turn off", disabled: false, disabledNote: null });
    expect(w.changedLine).toBe("Turned on by finance@btg.example on Oct 30, 2026, 14:05 UTC: Stripe live keys verified; go-live approved.");
  });

  it("off by the switch, provider set: Turn on is live and the text says what waits", () => {
    const w = switchWords(sw({ on: false, open: false, changed: { at: "2026-10-29T09:40:00.000Z", by: null, reason: "Webhook failing." } }));
    expect(w.state).toBe("off");
    expect(w.chip).toEqual({ label: "Off", tone: "warn" });
    expect(w.text).toMatch(/No checkout, no payout sent or set up, and no order cancelled for non-payment/);
    expect(w.next).toEqual({ open: true, label: "Turn on", disabled: false, disabledNote: null });
    /* The API couldn't name the changer: never a made-up name. */
    expect(w.changedLine).toBe("Turned off by someone at BTG on Oct 29, 2026, 09:40 UTC: Webhook failing.");
  });

  it("no provider in Railway: Turn on stays visible but disabled, and says why", () => {
    const w = switchWords(sw({ on: false, open: false, provider: "none", canTurnOn: false, changed: null }));
    expect(w.state).toBe("no-provider");
    expect(w.providerLine).toBe("Provider: No provider set in Railway");
    expect(w.text).toMatch(/^Payment provider not set up in Railway yet\./);
    expect(w.next).toEqual({ open: true, label: "Turn on", disabled: true, disabledNote: PROVIDER_NOT_SET_UP });
    expect(w.changedLine).toBeNull();
  });

  it("the switch on with no provider is still closed, and Turn off is still offered — the switch is BTG's to set either way", () => {
    const w = switchWords(sw({ on: true, open: false, provider: "none", canTurnOn: false }));
    expect(w.state).toBe("no-provider");
    expect(w.chip.label).toBe("Off");
    expect(w.switchLine).toBe("BTG's switch: on");
    expect(w.next).toEqual({ open: false, label: "Turn off", disabled: false, disabledNote: null });
  });

  it("the wording never says 'connected' — the state is payments open or not", () => {
    for (const s of [sw(), sw({ on: false, open: false }), sw({ open: false, provider: "none", canTurnOn: false })]) {
      const w = switchWords(s);
      expect(`${w.headline} ${w.text} ${w.next.disabledNote ?? ""}`).not.toMatch(/connected/i);
    }
    expect(PAYMENTS_OPEN_SOON).toBe("Payments open soon");
  });
});

describe("providerLabel and switchStamp", () => {
  it("names the provider the API sent, capitalised, and 'none' as no provider", () => {
    expect(providerLabel("stripe")).toBe("Stripe");
    expect(providerLabel("standin")).toBe("Standin");
    expect(providerLabel("none")).toBe("No provider set in Railway");
    expect(providerLabel("")).toBe("No provider set in Railway");
  });
  it("stamps in UTC, and reads '' for nothing or a bad date", () => {
    expect(switchStamp("2026-10-30T14:05:00.000Z")).toBe("Oct 30, 2026, 14:05 UTC");
    expect(switchStamp(null)).toBe("");
    expect(switchStamp("not a date")).toBe("");
  });
});

describe("confirmWords", () => {
  it("says in one line what on and off each mean", () => {
    const on = confirmWords(true);
    expect(on.title).toBe("Turn payments on?");
    expect(on.text).toMatch(/Checkout opens/);
    expect(on.text).toMatch(/every approved payout that waited is queued/);
    expect(on.button).toBe("Turn payments on");
    const off = confirmWords(false);
    expect(off.title).toBe("Turn payments off?");
    expect(off.text).toMatch(/No checkout, no payout sent or set up, and no order cancelled for non-payment/);
    expect(off.button).toBe("Turn payments off");
  });
});

describe("reasonProblem", () => {
  it("is the API's rule: at least five characters after trimming, at most five hundred", () => {
    expect(REASON_MIN).toBe(5);
    expect(REASON_MAX).toBe(500);
    expect(reasonProblem("")).toMatch(/at least 5 characters/);
    expect(reasonProblem("   abcd   ")).toMatch(/at least 5 characters/);
    expect(reasonProblem("abcde")).toBeNull();
    expect(reasonProblem("  Stripe live keys verified.  ")).toBeNull();
    expect(reasonProblem("x".repeat(501))).toMatch(/under 500/);
    expect(reasonProblem("x".repeat(500))).toBeNull();
  });
});

describe("historyLine", () => {
  it("one row: what, who, when and why — 'someone at BTG' when the API has no name", () => {
    expect(historyLine(base.history[0]!)).toEqual({
      when: "Oct 30, 2026, 14:05 UTC", what: "Turned on", who: "finance@btg.example", reason: "Stripe live keys verified; go-live approved.",
    });
    expect(historyLine(base.history[1]!)).toEqual({
      when: "Oct 29, 2026, 09:40 UTC", what: "Turned off", who: "someone at BTG", reason: "Webhook failing — closing while we look.",
    });
  });
});

describe("switchRefusal", () => {
  it("409 — on without a provider: the API's words, or the Railway line", () => {
    expect(switchRefusal(409, { error: { message: "Payments can't be turned on yet: production has no payment provider set up." } }))
      .toBe("Payments can't be turned on yet: production has no payment provider set up.");
    expect(switchRefusal(409)).toBe(`${PROVIDER_NOT_SET_UP}. Nothing changed.`);
  });
  it("422 and a schema 400 — the reason: the issue named, else the API's message, else the rule", () => {
    expect(switchRefusal(422, { error: { message: "Say why — the reason is kept with the change." } })).toBe("Say why — the reason is kept with the change.");
    expect(switchRefusal(400, { error: { message: "Invalid input", issues: [{ message: "Too small: expected string to have >=5 characters" }] } }))
      .toBe("Too small: expected string to have >=5 characters");
    expect(switchRefusal(422)).toMatch(/at least 5 characters/);
  });
  it("403 — the role rule; 401 — the session; 0 — unreachable; anything else the API's words or the status", () => {
    expect(switchRefusal(403, { error: { message: "forbidden" } })).toMatch(/Only a BTG admin or Finance/);
    expect(switchRefusal(401)).toMatch(/sign in again/);
    expect(switchRefusal(0)).toMatch(/unreachable/);
    expect(switchRefusal(500, { error: { message: "boom" } })).toBe("boom");
    expect(switchRefusal(502)).toBe("The switch wasn't changed (502). Try again in a minute.");
  });
});
