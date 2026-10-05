import { describe, expect, it } from "vitest";

import { NIL_JOBS } from "../src/domain/nil-jobs";
import { PRICED_TIERS, minimumSellPrice } from "../src/domain/pricing";
import { assertClearsFloor, floorFor, lineFloor, MarginFloorError } from "../src/domain/margin-floor";
import { readFileSync } from "node:fs";
import {
  ORDER_STATES, canTransitionOrder, legalOrderTransitions, type OrderState,
} from "../src/domain/order-state";
import { buildInvitationEmail } from "../worker/jobs/notify-invitation.mts";
import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";

/* --------------------------------------------------------------------------
   The margin floor, the order lifecycle and the invitation notification —
   P3-BE-12, P5-BE-02, P4-INT-01.

   All three are pure or near enough: the floor is arithmetic, the state table
   is data, and the notification's decision about whether to send at all is a
   function of the row it read. The parts that need Postgres — versioning a
   rate, freezing terms at send — are proven by the B1/B3 E2E work.
   -------------------------------------------------------------------------- */

describe("P3-BE-12 · the floor refuses, it does not report", () => {
  /* The acceptance asks for all seven jobs at all three tiers. That is 21
     cases and they are cheap, so they are all here rather than sampled — the
     whole finding behind P0-PMO-13 was that the collision existed on EVERY
     job, which a sampled test would have missed. */
  it.each(NIL_JOBS.flatMap((job) => PRICED_TIERS.map((tier) => [job.id, tier] as const)))(
    "%s at %s refuses a cent below the floor and accepts the floor itself",
    (jobId, tier) => {
      const job = NIL_JOBS.find((j) => j.id === jobId)!;
      const floor = minimumSellPrice(job.baseHigh, tier);

      expect(() => assertClearsFloor(jobId, job.baseHigh, tier, floor)).not.toThrow();
      expect(() => assertClearsFloor(jobId, job.baseHigh, tier, floor - 1))
        .toThrow(MarginFloorError);
    });

  it("names the job, the tier, the floor and the shortfall", () => {
    /* "Below the margin floor" sends someone to a spreadsheet; four numbers
       let them fix it in one step. */
    try {
      assertClearsFloor("SX-07", 750, "PREMIUM", 1000);
      throw new Error("should have refused");
    } catch (error) {
      const e = error as MarginFloorError;
      expect(e).toBeInstanceOf(MarginFloorError);
      expect(e.jobId).toBe("SX-07");
      expect(e.tier).toBe("PREMIUM");
      expect(e.floor).toBe(1575);
      expect(e.shortfall).toBe(575);
      expect(e.message).toContain("SX-07");
      expect(e.message).toContain("PREMIUM");
    }
  });

  it("rises with the tier, which is the collision it exists to stop", () => {
    const job = NIL_JOBS.find((j) => j.id === "SX-02")!;
    const [e, c, p] = PRICED_TIERS.map((t) => floorFor(job.baseHigh, t));
    expect(e!).toBeLessThan(c!);
    expect(c!).toBeLessThan(p!);
  });

  it("would have caught the original defect: SX-07 at its old floor", () => {
    /* SX-07's base-band top was $750 and its published sell floor was $750 —
       underwater before any multiplier. */
    expect(() => assertClearsFloor("SX-07", 750, "EMERGING", 750)).toThrow(MarginFloorError);
  });
});

describe("P5-BE-02 · the order lifecycle", () => {
  const LEGAL: ReadonlyArray<[OrderState, OrderState]> = [
    ["DRAFT", "SENT"], ["DRAFT", "CANCELLED"],
    ["SENT", "ACCEPTED"], ["SENT", "REJECTED"], ["SENT", "CANCELLED"],
    ["ACCEPTED", "ACTIVE"], ["ACCEPTED", "CANCELLED"],
    ["ACTIVE", "COMPLETED"], ["ACTIVE", "CANCELLED"],
  ];

  it("permits exactly these edges and no others", () => {
    const allowed = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    for (const from of ORDER_STATES) {
      for (const to of ORDER_STATES) {
        expect(canTransitionOrder(from, to), `${from} -> ${to}`)
          .toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it("treats REJECTED as terminal — a refusal is not edited away", () => {
    /* The answer to a rejection is a new order with new terms. Reopening this
       one would erase what was declined. */
    expect(legalOrderTransitions("REJECTED")).toEqual([]);
  });

  it("cannot be cancelled once COMPLETED", () => {
    /* The deliverables were made and the athlete is owed. */
    expect(canTransitionOrder("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("cannot be accepted before it is sent", () => {
    expect(canTransitionOrder("DRAFT", "ACCEPTED")).toBe(false);
  });
});

describe("P4-INT-01 · the invitation notification", () => {
  const row = {
    state: "INVITED", expiresAt: new Date(Date.now() + 86400000),
    email: "jordan@example.com", legalName: "Jordan Reed", displayName: "J.REED",
    sponsorName: "Bowie Auto", jobName: "Sponsored Post", offered: 12500,
  };

  it("builds a message for an open invitation", () => {
    const out = buildInvitationEmail(row, "https://sponsorx.example");
    expect("skip" in out).toBe(false);
    if ("skip" in out) return;
    expect(out.to).toBe("jordan@example.com");
    expect(out.data).toMatchObject({ firstName: "Jordan", sponsorName: "Bowie Auto" });
  });

  it("prints money as money, never as cents", () => {
    const out = buildInvitationEmail(row, "https://x");
    if ("skip" in out) throw new Error("expected a message");
    expect(out.data.offered).toBe("$125.00");
    expect(out.data.offered).not.toContain("12500");
  });

  it.each(["ACCEPTED", "DECLINED", "EXPIRED"])("skips an invitation that is %s", (state) => {
    /* The payload carries an id, and the world moves between enqueue and
       drain. Telling someone about an invitation they already declined is
       worse than telling them nothing. */
    const out = buildInvitationEmail({ ...row, state }, "https://x");
    expect(out).toHaveProperty("skip");
  });

  it("skips one that expired before the job ran", () => {
    const out = buildInvitationEmail(
      { ...row, expiresAt: new Date(Date.now() - 1000) }, "https://x");
    expect(out).toHaveProperty("skip");
  });

  it("renders all three invitation templates, including with nothing in them", () => {
    for (const t of ["invitation.sent", "invitation.reminder", "invitation.expiring"]) {
      expect(EMAIL_TEMPLATES[t], `${t} missing`).toBeTypeOf("function");
      const built = EMAIL_TEMPLATES[t]!({});
      expect(built.subject).not.toContain("undefined");
      expect(built.text).not.toContain("undefined");
    }
  });
});

describe("P3-BE-09 · the implied floor is rate x 1.4, in the rate's own unit", () => {
  it("is the acceptance's formula, not the catalogue's", () => {
    /* It returned baseHigh x tierMultiplier x 1.4 — the CATALOGUE's floor for
       the job, a different number — and the catalogue is in whole dollars
       while a rate is in cents, so the answer was out by a hundred as well as
       by a formula. A $120 rate returned 210. */
    expect(lineFloor(12000)).toBe(16800);
    expect(lineFloor(12000)).not.toBe(minimumSellPrice(100, "PREMIUM"));
  });

  it("rounds up, so the answer never sits under the rule", () => {
    expect(lineFloor(1)).toBe(2);
    expect(lineFloor(10001)).toBe(14002);
  });

  it("needs no tier — a rate already carries the athlete's price", () => {
    /* Which is why an ANCHOR athlete has an implied floor like everyone else,
       where the catalogue floor genuinely has none. */
    expect(lineFloor(50000)).toBe(70000);
  });
});

describe("P4-INT-01 · all three emails are enqueued by something", () => {
  const sweep = readFileSync(
    new URL("../worker/jobs/expire-invitations.mts", import.meta.url), "utf8");

  it.each(["invitation.reminder", "invitation.expiring"])("%s is sent by the sweep", (t) => {
    /* Both had templates and nothing sent them: one of three, where the
       acceptance says "invitation, reminder and expiry-warning emails ALL
       send as queued jobs". */
    expect(sweep).toContain(t);
  });

  it("keys each one per invitation, so an hourly sweep does not nag", () => {
    expect(sweep).toContain("'invitation.reminder:' || i.id");
    expect(sweep).toContain("'invitation.expiring:' || i.id");
  });

  it("only reminds an athlete who has not opened it", () => {
    expect(sweep).toContain('i."viewedAt" IS NULL');
  });

  it("does not warn about an invitation that already expired", () => {
    /* 2S8-OPS-02 — the clock in UTC, as the column holds it (utc-session.test.ts). */
    expect(sweep).toContain('i."expiresAt" > ${NOW}');
    expect(sweep).toContain("const NOW = `(now() AT TIME ZONE 'UTC')`");
  });
});
