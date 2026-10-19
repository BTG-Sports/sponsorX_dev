import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as Enums from "../src/generated/prisma/enums";
import * as C from "../src/domain/fact-classification";
import { FACT_KINDS } from "../src/domain/fact-rules";
import { DELIVERABLE_PLATFORMS } from "../src/domain/deliverable-platform";
import { codeOf, factSites, functionCode, type Site, type Source } from "./support/fact-coverage";

/* The refund and dispute lists live in modules that load the app's settings; no database is used. */
process.env.DATABASE_URL ??= "postgresql://unused@localhost/unused";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const { PAYMENT_METHODS } = await import("../src/domain/marketplace-order-rules");
const { REFUND_CAUSES, REFUND_METHODS, REFUND_STATES } = await import("../src/domain/refunds");
const { DISPUTE_STATES } = await import("../src/domain/payment-exceptions");

/* --------------------------------------------------------------------------
   3S1-QA-02 — nothing slips through the fact ledger
   (documentation/SponsorX-Fact-Ledger.md §6).

   The facts are only as good as their coverage, and a gap makes no error —
   the figures are just quietly wrong. So the build fails in two cases:

   1. A place in the code writes money or delivery data and does not record
      its fact. Every such write (found by reading the code, not by a list
      someone keeps) must have a reviewed decision below: the fact calls its
      function makes, and how many — or none, and why. Removing a call, or
      adding a write with no decision, fails here with its name.
   2. A status, payment type, refund cause or metric source is added without
      a decision for the facts (src/domain/fact-classification.ts).

   Done when: removing a fact write, or adding an unclassified state, fails CI.
   -------------------------------------------------------------------------- */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") return [];
    return statSync(path).isDirectory() ? walk(path) : /\.m?ts$/.test(name) ? [path] : [];
  });
}
const SOURCES: Source[] = [...walk(join(root, "src")), ...walk(join(root, "worker"))]
  .map((path) => ({ file: relative(root, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));

/**
 * The reviewed decision for each money or delivery write, by `file › function › write`.
 * `calls`: the fact writers that function must call, and at least how many times.
 * `via`: the decision lives in the functions that call this one — each must call
 * this function and then the fact writer.
 * `none`: no fact, and why.
 */
type Decision = { calls: Record<string, number> } | { via: string[]; calls: Record<string, number> } | { none: string };
const CO = "src/domain/campaign-order.ts";
const D = "src/domain/deliverable.ts";
const E = "src/domain/earning.ts";
const R = "src/domain/refunds.ts";
const DECISIONS: Record<string, Decision> = {
  /* Campaign orders */
  [`${CO} › createOrder › campaignOrder.create`]: { none: "A new order is a DRAFT: nothing is booked until it is accepted." },
  [`${CO} › updateOrderTerms › campaignOrder.update`]: { none: "Terms change only while DRAFT (TermsFrozenError); the amounts are read when it is accepted." },
  [`${CO} › transitionOrder › campaignOrder.update`]: { calls: { factOrderCancelled: 1 } },
  [`${CO} › acceptOrder › campaignOrder.update`]: { calls: { factOrderBooked: 1 } },
  ["src/domain/campaign.ts › launchIn › campaignOrder.updateMany"]: { none: "ACCEPTED → ACTIVE when the campaign goes live: no money moves; the booking was recorded at acceptance." },
  ["src/domain/offer.ts › respondToOffer › campaignOrder.create"]: { calls: { factOrderBooked: 1 } },
  ["src/domain/offer.ts › respondToOffer › deliverable.create"]: { calls: { factOrderBooked: 1 } },

  /* Deliverables */
  [`${D} › createDeliverablesFromJob › deliverable.createMany`]: { via: [`${CO} › acceptOrder`], calls: { factOrderBooked: 1 } },
  [`${D} › move › deliverable.updateMany`]: { calls: { factDeliverablePublished: 1, factDeliverableVerified: 1, factRevisionRequested: 1 } },
  /* Two writes: the submission, and the skip to the sponsor. Neither is a fact; failing the checks is. */
  [`${D} › submitDraft › deliverable.updateMany`]: { calls: { factRevisionRequested: 1 } },

  /* Earnings */
  [`${E} › createEarningForOrder › earning.create`]: { none: "An earning starts PENDING: nothing is paid." },
  [`${E} › transitionEarning › earning.update`]: { calls: { factEarningPaid: 1 } },
  [`${E} › adjustEarning › earning.update`]: { none: "Only while unpaid (isEarningMutable); the amount is recorded when it is paid." },
  [`${E} › maybeMakeEligible › earning.update`]: { none: "PENDING → ELIGIBLE: nothing is paid." },
  [`${E} › autoApproveEarning › earning.updateMany`]: { none: "ELIGIBLE → APPROVED_FOR_PAYOUT: nothing is paid." },

  /* Metrics and invoices */
  ["src/domain/metric.ts › recordMetric › metricDaily.upsert"]: { calls: { factMetricRecorded: 1 } },
  ["src/domain/invoice.ts › ingestZohoInvoice › campaignInvoice.upsert"]: { calls: { factInvoice: 1 } },

  /* NEXT ad slots */
  ["src/domain/edition.ts › sellIn › adSlot.updateMany"]: { calls: { factAdSlotSold: 1 } },
  ["src/domain/edition.ts › cancelEditionIn › adSlot.updateMany"]: { calls: { factAdSlotReleased: 1 } },
  ["src/domain/edition.ts › addSlot › adSlot.create"]: { none: "A new slot is unsold." },

  /* INFINEX placement windows (4S7-BE-01) */
  ["src/domain/virtual-bookings.ts › bookPlacement › placementWindow.create"]: { calls: { factPlacementWindowBooked: 1 } },
  ["src/domain/virtual-bookings.ts › releaseInside › placementWindow.updateMany"]: { calls: { factPlacementWindowReleased: 1 } },

  /* Marketplace */
  ["src/domain/ledger.ts › bookOrder › orderLineFinancials.create"]: { calls: { factMarketplaceContracted: 1 } },
  ["src/domain/ledger.ts › reverseOrder › ledgerEntry.updateMany"]: { calls: { factMarketplaceUnwound: 1 } },
  ["src/domain/ledger.ts › post › ledgerEntry.createMany"]: { none: "Posts one journal. The marketplace facts are recorded by bookOrder and reverseOrder, which call it." },

  /* Refunds: a fact when SENT, never when owed */
  [`${R} › recordRefund › refundDue.createMany`]: { none: "A refund starts OPEN: owed, not sent." },
  [`${R} › recordRefund › refundDue.updateMany`]: { calls: { factRefundSent: 2 } },
  [`${R} › sendRefund › refundDue.updateMany`]: { calls: { factRefundSent: 1 } },
  [`${R} › markRefundSent › refundDue.updateMany`]: { calls: { factRefundSent: 1 } },
  [`${R} › recordEditionRefund › refundDue.createMany`]: { none: "An edition refund starts OPEN, and is not marketplace money (fact-classification.ts REFUND_CAUSE_FACTS)." },
  [`${R} › refundPaymentAfterEditionCancel › refundDue.createMany`]: { none: "An edition refund starts OPEN, and is not marketplace money." },

  /* The ledger itself — the only code allowed to write the fact tables. */
  ["src/domain/facts.ts › recordFact › raw INSERT Fact"]: { none: "The ledger: recordFact is how a fact is written." },
  ["src/domain/facts.ts › reverseFact › raw INSERT Fact"]: { none: "The ledger: reverseFact is how a fact is corrected." },
  ["src/domain/facts.ts › moveSummary › raw INSERT CampaignDaySummary"]: { none: "The ledger: the summary moves with its fact." },
};

/** What is wrong with the code's fact coverage, one line each; [] when nothing. */
function coverageProblems(sources: Source[], decisions: Record<string, Decision>): string[] {
  const problems: string[] = [];
  const sites = factSites(sources);
  const callsIn = (code: string, writer: string) => [...code.matchAll(new RegExp(`\\b${writer}\\(`, "g"))].map((m) => m.index!);
  for (const site of sites) {
    const decision = decisions[site.key];
    const at = `${site.key} (line ${site.line})`;
    if (!decision) {
      problems.push(`${at}: writes money or delivery data with no decision — record its fact (src/domain/fact-writers.ts), or say why not in DECISIONS`);
      continue;
    }
    if ("none" in decision) {
      if (site.key.includes("› raw INSERT Fact") || site.key.includes("CampaignDaySummary") || /› (fact|campaignDaySummary)\./.test(site.key)) {
        if (site.file !== "src/domain/facts.ts") problems.push(`${at}: only src/domain/facts.ts may write the fact tables`);
      }
      continue;
    }
    if ("via" in decision) {
      for (const caller of decision.via) {
        const [file, fn] = caller.split(" › ") as [string, string];
        const code = functionCode(sources, file, fn);
        const call = code.search(new RegExp(`\\b${site.fn}\\(`));
        if (call === -1) problems.push(`${at}: ${caller} no longer calls ${site.fn}`);
        for (const [writer, n] of Object.entries(decision.calls)) {
          if (callsIn(code, writer).filter((i) => i > call).length < n) problems.push(`${at}: ${caller} must call ${writer} after ${site.fn}`);
        }
      }
      continue;
    }
    const code = functionCode(sources, site.file, site.fn);
    for (const [writer, n] of Object.entries(decision.calls)) {
      const made = callsIn(code, writer).length;
      if (made < n) problems.push(`${at}: must call ${writer} ${n === 1 ? "" : `${n} times `}in the same transaction — found ${made}`);
    }
  }
  /* Every caller of a `via` function is accounted for: a new caller would write without its fact. */
  for (const [key, decision] of Object.entries(decisions)) {
    if (!("via" in decision)) continue;
    const fn = key.split(" › ")[1]!;
    for (const src of sources) {
      for (const m of codeOf(src.text).matchAll(new RegExp(`\\b${fn}\\(`, "g"))) {
        const caller = callerOf(src, m.index!);
        if (caller && caller !== fn && !decision.via.includes(`${src.file} › ${caller}`)) problems.push(`${src.file} › ${caller} calls ${fn} — add it to the decision for ${key}, and record its fact there`);
      }
    }
  }
  /* A decision for a write that no longer exists is stale. */
  const live = new Set(sites.map((s: Site) => s.key));
  for (const key of Object.keys(decisions)) if (!live.has(key)) problems.push(`${key}: no such write any more — remove its decision`);
  return problems;
}

function callerOf(src: Source, index: number): string {
  const starts = [...src.text.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*(\w+)|const\s+(\w+)\s*(?::[^=]+)?=)/gm)];
  const before = starts.filter((m) => m.index! <= index).pop();
  return before ? (before[1] ?? before[2])! : "";
}

describe("3S1-QA-02 · every money and delivery write records its fact", () => {
  it("finds the writes by reading the code", () => {
    expect(factSites(SOURCES).length).toBeGreaterThanOrEqual(30);
  });

  it("each one has a reviewed decision, and makes the fact calls it says", () => {
    expect(coverageProblems(SOURCES, DECISIONS)).toEqual([]);
  });

  it("each decision names a real fact writer", () => {
    const writers = codeOf(readFileSync(join(root, "src/domain/fact-writers.ts"), "utf8"));
    for (const decision of Object.values(DECISIONS)) {
      if ("none" in decision) {
        expect(decision.none.length).toBeGreaterThan(10);
        continue;
      }
      for (const w of Object.keys(decision.calls)) expect(writers, w).toMatch(new RegExp(`export async function ${w}\\(`));
    }
  });

  describe("and the check would catch a mistake", () => {
    const mutate = (file: string, from: string | RegExp, to: string) =>
      SOURCES.map((s) => (s.file === file ? { ...s, text: s.text.replace(from, to) } : s));

    it("a fact call removed from an action fails", () => {
      const without = mutate("src/domain/earning.ts", /await factEarningPaid\(tx, earningId\);/, "");
      expect(coverageProblems(without, DECISIONS)).toEqual([expect.stringMatching(/transitionEarning › earning\.update .*must call factEarningPaid/)]);
    });

    it("one of two refund fact calls removed fails, though the other remains", () => {
      const without = mutate("src/domain/refunds.ts", /await factRefundSent\(tx, row\.id\);/, "");
      expect(coverageProblems(without, DECISIONS)).toEqual([expect.stringMatching(/recordRefund › refundDue\.updateMany .*factRefundSent 2 times .*found 1/)]);
    });

    it("a fact call only mentioned in a comment does not count", () => {
      const commented = mutate("src/domain/metric.ts", /await factMetricRecorded\(tx, row\.id\);/, "// await factMetricRecorded(tx, row.id);");
      expect(coverageProblems(commented, DECISIONS)).toEqual([expect.stringMatching(/recordMetric › metricDaily\.upsert .*factMetricRecorded/)]);
    });

    it("a new write of money or delivery data with no decision fails", () => {
      const added = [...SOURCES, { file: "src/domain/new-thing.ts", text: `export async function payBonus(tx) {\n  await tx.earning.update({ where: { id }, data: { paidAt: new Date() } });\n}\n` }];
      expect(coverageProblems(added, DECISIONS)).toEqual([expect.stringMatching(/new-thing\.ts › payBonus › earning\.update .*no decision/)]);
    });

    it("writing the fact tables anywhere but the ledger fails", () => {
      const added = [...SOURCES, { file: "src/domain/fix.ts", text: "export async function fix(tx) {\n  await tx.$executeRawUnsafe(`UPDATE \"CampaignDaySummary\" SET x = 1`);\n}\n" }];
      expect(coverageProblems(added, DECISIONS)).toEqual([expect.stringMatching(/fix\.ts › fix › raw UPDATE CampaignDaySummary .*no decision/)]);
    });

    it("a new caller of the deliverable set's creator fails until it records the due facts", () => {
      const added = [...SOURCES, { file: "src/domain/other.ts", text: "export async function reissue(tx) {\n  await createDeliverablesFromJob(tx, a, o);\n}\n" }];
      expect(coverageProblems(added, DECISIONS)).toEqual([expect.stringMatching(/other\.ts › reissue calls createDeliverablesFromJob/)]);
    });
  });
});

/* ── Part 2: every status, type and source is classified ─────────────────── */

const enumValues = (e: Record<string, string>) => Object.values(e).sort();
const classified = (t: object) => Object.keys(t).sort();
/** The values in the app's list with no decision in the table — what the build names when one is added. */
const unclassified = (values: readonly string[], table: object) => values.filter((v) => !(v in table));

const VOCABULARIES: Array<[string, readonly string[], object]> = [
  ["order states (OrderState)", enumValues(Enums.OrderState), C.ORDER_STATE_FACTS],
  ["deliverable states (DeliverableState)", enumValues(Enums.DeliverableState), C.DELIVERABLE_STATE_FACTS],
  ["earning states (EarningState)", enumValues(Enums.EarningState), C.EARNING_STATE_FACTS],
  ["metric sources (MetricSource)", enumValues(Enums.MetricSource), C.METRIC_SOURCE_MEASURES],
  ["edition states (EditionState)", enumValues(Enums.EditionState), C.EDITION_STATE_FACTS],
  ["marketplace order states (MarketplaceOrderState)", enumValues(Enums.MarketplaceOrderState), C.MARKETPLACE_ORDER_STATE_FACTS],
  ["deliverable platforms", [...DELIVERABLE_PLATFORMS].sort(), C.PLATFORM_CHANNELS],
  ["payment methods", [...PAYMENT_METHODS].sort(), C.PAYMENT_METHOD_FACTS],
  ["refund causes", [...REFUND_CAUSES].sort(), C.REFUND_CAUSE_FACTS],
  ["refund states", [...REFUND_STATES].sort(), C.REFUND_STATE_FACTS],
  ["refund methods", [...REFUND_METHODS].sort(), C.REFUND_METHOD_FACTS],
  ["payment dispute states", [...DISPUTE_STATES].sort(), C.DISPUTE_STATE_FACTS],
];

describe("3S1-QA-02 · every status, payment type and source is classified for the facts", () => {
  for (const [name, values, table] of VOCABULARIES) {
    it(`${name}: each value has a decision, and nothing else does`, () => {
      expect(unclassified(values, table), `unclassified ${name} — add each to src/domain/fact-classification.ts`).toEqual([]);
      expect(classified(table)).toEqual([...values]);
    });
  }

  it("every decision names real facts and says why", () => {
    for (const [, , table] of VOCABULARIES) {
      for (const d of Object.values(table) as unknown[]) {
        /* The two routing tables (metric measures, platform channels) hold where a figure is filed, not a decision. */
        if (typeof d !== "object" || d === null || !("why" in d)) continue;
        const c = d as C.Classified;
        expect(c.why.length).toBeGreaterThan(10);
        for (const f of c.facts) expect(FACT_KINDS).toContain(f);
      }
    }
  });

  it("a status added to the app with no decision is named", () => {
    expect(unclassified([...enumValues(Enums.OrderState), "ON_HOLD"], C.ORDER_STATE_FACTS)).toEqual(["ON_HOLD"]);
    expect(unclassified([...REFUND_CAUSES, "GOODWILL"], C.REFUND_CAUSE_FACTS)).toEqual(["GOODWILL"]);
  });
});
