import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   POL-FE-51 — what a sponsor may learn about the athlete pool, and how.

   Three sponsor-safe reads, each answering VALUES or YES / NO, never a name,
   an id or a count:
     - GET /catalogue/targeting   the sports and state codes of the tenant's
                                  ACTIVE athletes (the drawer's options);
     - GET /catalogue/staffing    per package, whether at least its minimum
                                  fit (athleteFit, the automatic-approval rule);
     - GET /catalogue/packages    the same yes / no with no targeting, and
                                  whether a package is a NEXT magazine ad;
   and one word on a sponsor's brief, `waitingOn`, which says ATHLETES only
   when a brief is held for nothing but too few athletes — never the hold.

   Every athlete read is pinned to the CALLER's tenant; the tests read the
   exact where clauses the domain sends.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

const calls = {
  athleteCount: [] as Record<string, unknown>[],
  athleteFindMany: [] as Record<string, unknown>[],
  sponsorFindFirst: [] as Record<string, unknown>[],
  packageFindMany: [] as Record<string, unknown>[],
};
let fitCount = 0;
let packages: Record<string, unknown>[] = [];
let athleteRows: Record<string, unknown>[] = [];
let briefs: unknown[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    sponsorPackage: {
      findMany: (a: Record<string, unknown>) => (calls.packageFindMany.push(a), Promise.resolve(packages)),
    },
    sponsor: {
      findFirst: (a: Record<string, unknown>) => (calls.sponsorFindFirst.push(a), Promise.resolve({ categories: ["ALCOHOL"] })),
    },
    athlete: {
      count: (a: Record<string, unknown>) => (calls.athleteCount.push(a), Promise.resolve(fitCount)),
      findMany: (a: Record<string, unknown>) => {
        calls.athleteFindMany.push(a);
        const key = Object.keys(a.select as object)[0];
        return Promise.resolve(athleteRows.map((r) => ({ [key]: r[key] })));
      },
    },
    campaignBrief: {
      findMany: () => Promise.resolve(briefs),
      findFirst: () => Promise.resolve(briefs[0] ?? null),
    },
    campaignInvite: { findMany: () => Promise.resolve([]) },
    nilJob: { findMany: () => Promise.resolve([]) },
    inquiry: { findMany: () => Promise.resolve([]) },
    accountClosure: { findMany: () => Promise.resolve([]) },
  },
}));

const { listPackages, listTargeting, packageKind, packageStaffing } = await import("../src/domain/catalogue");
const { packageStaffable, sponsorWaitingOn } = await import("../src/domain/brief-auto-rules");
const { ATHLETE_PACKAGES, NEXT_PACKAGES } = await import("../src/domain/sponsor-packages");
const { readBrief, listBriefs } = await import("../src/routes/v1/campaigns");

const base = { userId: "u_1", tenantId: "t_1", athleteId: null, guardianId: null, propertyId: null };
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "spn_1" } as unknown as Actor;
const analyst = { ...base, roles: ["SPONSOR_ANALYST"], sponsorId: "spn_1" } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], sponsorId: null, athleteId: "ath_1" } as unknown as Actor;

const BLITZ = { id: "pkg_blitz", code: "LOCAL_BLITZ", name: "Local Blitz", priceLow: 1500, priceHigh: 2400, athleteCountMin: 5, athleteCountMax: 9, lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }], includes: [{ kind: "REPORT", code: "BASIC_REPORT" }], exclusivity: false, durationWeeks: 2 };
const TEST_DRIVE = { ...BLITZ, id: "pkg_td", code: "TEST_DRIVE", name: "SponsorX Test Drive", athleteCountMin: 3, athleteCountMax: 3 };
const NEXT_AD = { id: "pkg_next", code: "NEXT-AD-HALF", name: "NEXT Half-Page Ad", priceLow: 500, priceHigh: 500, athleteCountMin: 0, athleteCountMax: 0, lineItems: [], includes: [{ kind: "AD_SLOT", code: "HALF" }], exclusivity: false, durationWeeks: null };

beforeEach(() => {
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0;
  fitCount = 0;
  packages = [TEST_DRIVE, BLITZ, NEXT_AD];
  athleteRows = [];
  briefs = [];
});

/* ------------------------------------------------------------ the rules */

describe("the pure rules", () => {
  it("a package is staffable when at least its minimum fit; a NEXT ad (no job lines) has no answer", () => {
    expect(packageStaffable(BLITZ, 5)).toBe(true);
    expect(packageStaffable(BLITZ, 4)).toBe(false);
    expect(packageStaffable({ ...BLITZ, athleteCountMin: 0 }, 0)).toBe(false); // never fewer than one
    expect(packageStaffable(NEXT_AD, 100)).toBeNull();
  });

  it("waitingOn says ATHLETES only for a draft held for athletes alone", () => {
    expect(sponsorWaitingOn("DRAFT", ["ATHLETES"])).toBe("ATHLETES");
    /* Held for anything else too: it reads like any request BTG has not reached. */
    expect(sponsorWaitingOn("DRAFT", ["ATHLETES", "SENSITIVE"])).toBe("BTG");
    expect(sponsorWaitingOn("DRAFT", ["DATES"])).toBe("BTG");
    expect(sponsorWaitingOn("DRAFT", [])).toBe("BTG");
    expect(sponsorWaitingOn("QUALIFIED", [])).toBe("BTG");
    for (const s of ["APPROVED", "CAMPAIGN_CREATED", "CLOSED"]) expect(sponsorWaitingOn(s, ["ATHLETES"])).toBeNull();
  });

  it("tells every seeded NEXT product apart from every athlete package", () => {
    for (const p of ATHLETE_PACKAGES) expect(packageKind({ ...p, includes: p.includes ?? [] })).toBe("ATHLETE");
    for (const p of NEXT_PACKAGES) expect(packageKind({ ...p, includes: p.includes ?? [] })).toBe("NEXT_AD");
    /* Whatever its code, a package that sells an ad slot and no athlete work is an ad. */
    expect(packageKind({ code: "SPRING_AD", lineItems: [], includes: [{ kind: "AD_SLOT" }] })).toBe("NEXT_AD");
  });
});

/* ------------------------------------------------- GET /catalogue/targeting */

describe("listTargeting — the drawer's sports and states", () => {
  it("answers distinct, sorted values of the caller's tenant's ACTIVE athletes — nothing else", async () => {
    athleteRows = [
      { sport: "Soccer", stateCode: "VA", countryCode: "US" },
      { sport: "Basketball", stateCode: "MD", countryCode: "US" },
      { sport: "Basketball", stateCode: null, countryCode: "ca" },
    ];
    const out = await listTargeting(sponsor);
    /* POL-BE-107 — the countries too, upper-cased. */
    expect(out).toEqual({ sports: ["Basketball", "Soccer"], countryCodes: ["CA", "US"], stateCodes: ["MD", "VA"] });
    expect(Object.keys(out).sort()).toEqual(["countryCodes", "sports", "stateCodes"]);
    for (const a of calls.athleteFindMany) {
      expect(a.where).toMatchObject({ tenantId: "t_1", state: "ACTIVE" });
      /* One column, one value per row: no id, name or count can come back. */
      expect(Object.keys(a.select as object)).toHaveLength(1);
      expect(a.distinct).toBeDefined();
    }
  });

  it("is open to a read-only sponsor and closed to a role that can't browse packages", async () => {
    await expect(listTargeting(analyst)).resolves.toBeDefined();
    await expect(listTargeting(athlete)).rejects.toThrow();
    expect(calls.athleteFindMany.length).toBe(3); // the analyst's three reads only (sports, countries — POL-BE-107 — and states)
  });
});

/* -------------------------------------------------- GET /catalogue/staffing */

describe("packageStaffing — a yes / no per package", () => {
  it("counts with athleteFit in the caller's tenant, after the sponsor's own categories", async () => {
    fitCount = 4;
    const out = await packageStaffing(sponsor, { sports: ["Basketball"], stateCodes: ["MD"] });
    expect(out).toEqual([
      { id: "pkg_td", staffable: true },
      { id: "pkg_blitz", staffable: false },
      { id: "pkg_next", staffable: null },
    ]);
    expect(calls.athleteCount).toHaveLength(1);
    expect(calls.athleteCount[0].where).toEqual({
      tenantId: "t_1",
      state: "ACTIVE",
      sport: { in: ["Basketball"] },
      stateCode: { in: ["MD"] },
      NOT: { restrictedCategories: { hasSome: ["ALCOHOL"] } },
    });
    /* The sponsor whose categories count is the caller's own, in the caller's tenant. */
    expect(calls.sponsorFindFirst[0].where).toEqual({ id: "spn_1", tenantId: "t_1" });
    /* The packages read is the caller's own catalogue, on sale. */
    expect(calls.packageFindMany[0].where).toMatchObject({ tenantId: "t_1", active: true });
  });

  it("never answers the count, a name or an athlete id", async () => {
    fitCount = 37;
    const body = JSON.stringify(await packageStaffing(sponsor, { sports: [], stateCodes: [] }));
    expect(body).not.toContain("37");
    expect(body).not.toMatch(/athlete|name|count/i);
  });

  it("asks nothing of the athlete pool when no package has athlete work", async () => {
    packages = [NEXT_AD];
    expect(await packageStaffing(sponsor, { sports: [], stateCodes: [] })).toEqual([{ id: "pkg_next", staffable: null }]);
    expect(calls.athleteCount).toHaveLength(0);
  });

  it("is refused to a role that can't browse packages", async () => {
    await expect(packageStaffing(athlete, { sports: [], stateCodes: [] })).rejects.toThrow();
    expect(calls.athleteCount).toHaveLength(0);
  });
});

/* ------------------------------------------------- GET /catalogue/packages */

describe("listPackages — kind and staffable on every package", () => {
  it("marks NEXT ads and answers staffable with no targeting", async () => {
    fitCount = 5;
    const out = await listPackages(sponsor);
    expect(out.map((p) => [p.id, p.kind, p.staffable])).toEqual([
      ["pkg_td", "ATHLETE", true],
      ["pkg_blitz", "ATHLETE", true],
      ["pkg_next", "NEXT_AD", null],
    ]);
    /* No targeting: only ACTIVE, tenant and the sponsor's categories narrow the count. */
    expect(calls.athleteCount[0].where).toEqual({ tenantId: "t_1", state: "ACTIVE", NOT: { restrictedCategories: { hasSome: ["ALCOHOL"] } } });
    expect(JSON.stringify(out)).not.toContain("fitCount");
  });
});

/* --------------------------------------------------- waitingOn on a brief */

describe("a sponsor's brief says who it waits on — never why", () => {
  const BRIEF = {
    id: "brf_1", objective: "Fall foot traffic", state: "DRAFT", budget: 150_000, closeReason: null,
    startDate: new Date("2026-12-01T00:00:00Z"), endDate: new Date("2026-12-29T00:00:00Z"),
    sports: ["Lacrosse"], stateCodes: ["MD"], categories: [], excludedCategories: [], channels: [], audienceTiers: [], audienceMinFollowers: null,
    createdAt: new Date("2026-11-15T00:00:00Z"),
    autoApproved: false, heldAt: new Date("2026-11-15T00:00:00Z"),
    heldKeys: ["ATHLETES"], heldReasons: ["No athletes fit yet; the package needs 5"],
    tenantId: "t_1", sponsorId: "spn_1",
    sponsor: { name: "Bowie Auto Group" },
    package: { code: "LOCAL_BLITZ", name: "Local Blitz", lineItems: [], athleteCountMin: 5, athleteCountMax: 9, priceLow: 1500, priceHigh: 2400 },
    campaign: null,
  };

  async function run(handler: unknown, req: Record<string, unknown>) {
    let body: Record<string, unknown> | undefined;
    const res = { json: (b: Record<string, unknown>) => void (body = b) };
    await (handler as (q: unknown, r: unknown, n: unknown) => Promise<void>)(req, res, () => {});
    return body!;
  }

  it("ATHLETES on the detail and the list, with no hold text, keys or counts", async () => {
    briefs = [BRIEF];
    const one = await run(readBrief, { actor: sponsor, params: { id: "brf_1" } });
    expect(one.waitingOn).toBe("ATHLETES");
    const list = await run(listBriefs, { actor: sponsor, query: {} });
    expect((list.briefs as Record<string, unknown>[])[0].waitingOn).toBe("ATHLETES");
    for (const body of [one, list]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("heldKeys");
      expect(text).not.toContain("heldReasons");
      expect(text).not.toContain("No athletes fit");
    }
  });

  it("BTG for a brief held for anything else, null once approved", async () => {
    briefs = [{ ...BRIEF, heldKeys: ["DATES"], heldReasons: ["Dates: the start date isn't in the future"] }];
    expect((await run(readBrief, { actor: sponsor, params: { id: "brf_1" } })).waitingOn).toBe("BTG");
    briefs = [{ ...BRIEF, state: "APPROVED", heldAt: null, heldKeys: [], heldReasons: [] }];
    expect((await run(readBrief, { actor: sponsor, params: { id: "brf_1" } })).waitingOn).toBeNull();
  });
});
