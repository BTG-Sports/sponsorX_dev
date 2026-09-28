import { describe, expect, it } from "vitest";

import { clearanceQueue, coverage, ledgerRows, NEXT_STATE, type ApiRightsAsset } from "../src/lib/rights-live";

/* P9-FE-09 — the queue is exactly the assets the API's gate says are not
   covered; nothing is recomputed from the grants on the client. */

const asset = (o: Partial<ApiRightsAsset>): ApiRightsAsset => ({
  id: "a", kind: "PHOTO", title: "t", sourceKind: "STUDENT", studentId: null, athleteId: null, campaignId: null,
  clearedDigital: true, clearedPrint: true, rights: [], ...o,
});

describe("rights-live", () => {
  const assets = [
    asset({ id: "ok" }),
    asset({ id: "print", clearedPrint: false, sourceKind: "THIRD_PARTY" }),
    asset({
      id: "both", clearedDigital: false, clearedPrint: false,
      /* a grant that exists but has lapsed — the API says uncleared, so it is */
      rights: [{ id: "r", grantorKind: "STUDENT", grantorRef: "x", mayPublishDigital: true, mayPublishPrint: true, mayPromote: false, mayReuseCommercially: false, territory: null, startsAt: "2025-01-01T00:00:00Z", endsAt: "2025-02-01T00:00:00Z", attribution: null, acceptanceId: "acc", licenseRef: null }],
    }),
  ];
  it("queues what the gate refuses, naming what is missing and who grants it", () => {
    const q = clearanceQueue(assets);
    expect(q.map((x) => [x.asset.id, x.missing])).toEqual([["print", "Print"], ["both", "Digital + print"]]);
    expect(q[0]!.grantedBy).toContain("licence");
    expect(q[1]!.grantedBy).toContain("student");
  });
  it("trusts the API's clearance over the grants it can see", () => {
    expect(clearanceQueue(assets).some((x) => x.asset.id === "both")).toBe(true);
  });
  it("coverage counts per use", () => {
    expect(coverage(assets)).toEqual({ total: 3, digital: 2, print: 1 });
  });
  it("ledger is one row per grant", () => {
    expect(ledgerRows(assets)).toHaveLength(1);
    expect(ledgerRows([asset({ rights: undefined })])).toEqual([]);
  });
  it("offers only forward moves, never cancel", () => {
    expect(NEXT_STATE.CLOSED).toBe("IN_PRODUCTION");
    expect(NEXT_STATE.IN_PRODUCTION).toBe("PUBLISHED_DIGITAL");
    expect(Object.values(NEXT_STATE)).not.toContain("CANCELLED");
    expect(NEXT_STATE.DISTRIBUTED).toBeUndefined();
  });
});
