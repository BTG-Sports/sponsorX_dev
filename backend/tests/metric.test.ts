/**
 * P7-DATA-01 — "Every metric row carries one of the five §22 source labels;
 * verified-API, verified-manual, self-reported, estimated and attributed are
 * never conflated" — and P7-DATA-02's fold.
 *
 * "Never conflated" is a claim about SHAPE, and shape is testable: no read in
 * this area returns a single number, the five labels survive every fold, and
 * a figure from one source never overwrites a figure from another.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blendedTotalRequiringDisclosure, displayLabel, emptyTotals, isVerified,
  METRIC_SOURCES, UnknownMetricSourceError, assertMetricSource, verifiedTotal,
  type MetricSource,
} from "../src/domain/metric-source";
import { foldGrouped } from "../worker/jobs/rollup-metrics.mts";

let deliverable: Record<string, unknown> | null;
let upserts: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
let auditRows: Record<string, unknown>[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

vi.mock("../src/db/client", () => {
  const tx = {
    deliverable: { findFirst: () => Promise.resolve(deliverable) },
    metricDaily: {
      upsert: (args: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args);
        return Promise.resolve({
          id: "md_1", source: args.create.source, day: args.create.day,
        });
      },
      findMany: () => Promise.resolve([]),
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data); return Promise.resolve({ id: "a" });
      },
    },
  };
  return { prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const { recordMetric, dayOf, FutureMetricError } = await import("../src/domain/metric");

const actor = (roles = ["CAMPAIGN_MGR"]) =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as never;

const NOW = new Date("2026-09-23T12:00:00.000Z");

beforeEach(() => {
  deliverable = { id: "dlv_1", tenantId: "t1" };
  upserts = [];
  auditRows = [];
});

describe("the five §22 labels", () => {
  it("is exactly five, in evidence order", () => {
    expect([...METRIC_SOURCES]).toEqual([
      "VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED",
    ]);
  });

  it("treats only the two verified labels as verified", () => {
    for (const s of METRIC_SOURCES) {
      expect(isVerified(s)).toBe(s === "VERIFIED_API" || s === "VERIFIED_MANUAL");
    }
  });

  /* A number the UI cannot label is a number the UI must not show. */
  it("qualifies every unverified label on screen, and only those", () => {
    expect(displayLabel("VERIFIED_API")).toBeNull();
    expect(displayLabel("VERIFIED_MANUAL")).toBeNull();
    expect(displayLabel("SELF_REPORTED")).toBe("SELF-REPORTED");
    expect(displayLabel("ESTIMATED")).toBe("EST");
    expect(displayLabel("ATTRIBUTED")).toBe("ATTRIBUTED");
  });

  it("refuses a label §22 does not define", () => {
    expect(() => assertMetricSource("GUESSED")).toThrow(UnknownMetricSourceError);
    expect(() => assertMetricSource("VERIFIED_API")).not.toThrow();
  });
});

describe("totals never silently blend", () => {
  const totals = {
    VERIFIED_API: 100, VERIFIED_MANUAL: 50,
    SELF_REPORTED: 900, ESTIMATED: 40, ATTRIBUTED: 7,
  };

  it("verifiedTotal counts only the verified pair", () => {
    expect(verifiedTotal(totals)).toBe(150);
  });

  /* The blended figure exists — "total reach" is a real question — but it is
     named so that no reader mistakes it for a verified number. */
  it("the blended total is reachable only under a name that discloses it", () => {
    expect(blendedTotalRequiringDisclosure(totals)).toBe(1097);
    expect(blendedTotalRequiringDisclosure(totals)).not.toBe(verifiedTotal(totals));
  });

  it("an empty set is five zeroes, not one", () => {
    expect(Object.keys(emptyTotals()).sort()).toEqual([...METRIC_SOURCES].sort());
  });
});

describe("P7-DATA-01 · recording a figure", () => {
  it("keys the row on deliverable, day and source", async () => {
    await recordMetric(actor(), {
      deliverableId: "dlv_1", day: new Date("2026-09-20T09:30:00.000Z"),
      views: 1000, engagements: 40, source: "VERIFIED_API",
    }, NOW);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.where).toMatchObject({
      deliverableId_day_source: {
        deliverableId: "dlv_1",
        source: "VERIFIED_API",
      },
    });
  });

  it("normalises the day to midnight UTC — the column is a date", () => {
    expect(dayOf(new Date("2026-09-20T23:59:59.000Z")).toISOString())
      .toBe("2026-09-20T00:00:00.000Z");
  });

  /* An API figure was not entered by a person, and stamping a staff id on it
     would make an automated read look like a human attestation. */
  it("records no enterer for a VERIFIED_API figure", async () => {
    await recordMetric(actor(), {
      deliverableId: "dlv_1", day: NOW, views: 1, engagements: 1, source: "VERIFIED_API",
    }, NOW);
    expect(upserts[0]!.create.enteredBy).toBeNull();
  });

  it.each(["VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED"])(
    "records who entered a %s figure",
    async (source) => {
      await recordMetric(actor(), {
        deliverableId: "dlv_1", day: NOW, views: 1, engagements: 1,
        source: source as MetricSource,
      }, NOW);
      expect(upserts[0]!.create.enteredBy).toBe("u");
    },
  );

  /* A figure dated in the future is a typo or a projection, and a projection
     is not a measurement. */
  it("refuses a day that has not happened", async () => {
    await expect(
      recordMetric(actor(), {
        deliverableId: "dlv_1", day: new Date("2026-09-24T00:00:00.000Z"),
        views: 1, engagements: 1, source: "VERIFIED_API",
      }, NOW),
    ).rejects.toThrow(FutureMetricError);
    expect(upserts).toEqual([]);
  });

  it("accepts today", async () => {
    await expect(
      recordMetric(actor(), {
        deliverableId: "dlv_1", day: NOW, views: 1, engagements: 1, source: "VERIFIED_API",
      }, NOW),
    ).resolves.toBeTruthy();
  });

  it("audits the provenance, not just the value", async () => {
    await recordMetric(actor(), {
      deliverableId: "dlv_1", day: NOW, views: 1000, engagements: 40,
      source: "SELF_REPORTED",
    }, NOW);
    expect(auditRows[0]!.action).toBe("metric.record");
    expect(auditRows[0]!.after).toMatchObject({ source: "SELF_REPORTED", views: 1000 });
  });

  it("refuses a deliverable the actor cannot reach", async () => {
    deliverable = null;
    await expect(
      recordMetric(actor(), {
        deliverableId: "dlv_1", day: NOW, views: 1, engagements: 1, source: "VERIFIED_API",
      }, NOW),
    ).rejects.toThrow();
    expect(upserts).toEqual([]);
  });

  it("refuses a role without tenant-wide metric write", async () => {
    await expect(
      recordMetric(actor(["ATHLETE"]), {
        deliverableId: "dlv_1", day: NOW, views: 1, engagements: 1, source: "SELF_REPORTED",
      }, NOW),
    ).rejects.toThrow();
  });
});

describe("P7-DATA-02 · the rollup keeps the labels apart", () => {
  it("folds grouped rows into five numbers per subject", () => {
    const out = foldGrouped([
      { key: "cmp_1", source: "VERIFIED_API", views: 100, engagements: 10 },
      { key: "cmp_1", source: "SELF_REPORTED", views: 900, engagements: 90 },
      { key: "cmp_2", source: "ESTIMATED", views: 5, engagements: 1 },
    ]);

    const c1 = out.find((r) => r.key === "cmp_1")!;
    expect(c1.views.VERIFIED_API).toBe(100);
    expect(c1.views.SELF_REPORTED).toBe(900);
    /* THE CLAUSE: the rollup must not sum the labels away one layer below
       where anyone would look for it. */
    expect(c1.verifiedViews).toBe(100);
    expect(c1.verifiedViews).not.toBe(1000);
    expect(out.find((r) => r.key === "cmp_2")!.views.ESTIMATED).toBe(5);
  });

  it("copes with Postgres returning SUM() as a string", () => {
    const out = foldGrouped([
      { key: "cmp_1", source: "VERIFIED_API", views: "250", engagements: "12" },
    ]);
    expect(out[0]!.views.VERIFIED_API).toBe(250);
    expect(out[0]!.verifiedViews).toBe(250);
  });

  it("gives every subject all five keys, even unused ones", () => {
    const out = foldGrouped([
      { key: "ath_1", source: "ATTRIBUTED", views: 3, engagements: 0 },
    ]);
    expect(Object.keys(out[0]!.views).sort()).toEqual([...METRIC_SOURCES].sort());
    expect(out[0]!.views.VERIFIED_API).toBe(0);
  });
});
