import { describe, expect, it } from "vitest";

import {
  athletesNeeded,
  autoApprovalHolds,
  heldOnlyForAthletes,
  holdKeys,
  HOLD_KEYS,
  sponsorBriefStatus,
  SPONSOR_APPROVED,
  SPONSOR_REVIEWING,
  type AutoApprovalInput,
} from "../src/domain/brief-auto-rules";
import { SENSITIVE_CATEGORIES } from "../src/domain/brand-categories";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* P4-BE-11 — the automatic brief approval's rules, pure. (offer-draft.ts
   pulls in the database client's env check, so it is imported after the
   env is set, as match-score.test.ts does.) */
process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const { CATEGORY_DISCLOSURES } = await import("../src/domain/offer-draft");

const NOW = new Date("2026-10-03T12:00:00.000Z");
const DAY = 86_400_000;
const ok: AutoApprovalInput = {
  objective: "Drive foot traffic to the new store during the back to school weeks",
  startDate: new Date(NOW.getTime() + 10 * DAY),
  endDate: new Date(NOW.getTime() + 38 * DAY),
  budget: 150_000,
  package: { name: "Local Blitz", priceLow: 1_500, athleteCountMin: 5 },
  lowestJobFloor: { dollars: 70, jobId: "SX-01", jobName: "Story Drop", tier: "EMERGING" },
  sponsor: { ok: true },
  fitCount: 5,
  briefCategories: [],
  sponsorCategories: [],
  now: NOW,
};
const holds = (over: Partial<AutoApprovalInput>) => autoApprovalHolds({ ...ok, ...over });

describe("P4-BE-11 · autoApprovalHolds", () => {
  it("every check passing: no holds", () => {
    expect(holds({})).toEqual([]);
  });

  it("no package: BTG prices custom requests", () => {
    expect(holds({ package: null })).toEqual([{ key: "NO_PACKAGE", text: "No package — BTG prices custom requests" }]);
  });

  it("a package taken off sale: BTG prices it", () => {
    expect(holds({ package: { name: "Local Blitz", priceLow: 1_500, athleteCountMin: 5, active: false } })).toEqual([
      { key: "NO_PACKAGE", text: "The Local Blitz package is no longer offered — BTG prices this request" },
    ]);
    expect(holds({ package: { name: "Local Blitz", priceLow: 1_500, athleteCountMin: 5, active: true } })).toEqual([]);
  });

  it("budget below the package price — at priceLow exactly passes", () => {
    expect(holds({ budget: 149_999 })).toEqual([{ key: "BUDGET", text: "Budget $1,499.99 is below the Local Blitz price ($1,500)" }]);
    expect(holds({ budget: 150_000 })).toEqual([]);
  });

  it("too few athletes: the package's minimum, never fewer than one", () => {
    expect(holds({ fitCount: 3 })).toEqual([{ key: "ATHLETES", text: "Only 3 athletes fit; the package needs 5" }]);
    expect(holds({ fitCount: 1 })[0]!.text).toBe("Only 1 athlete fits; the package needs 5");
    expect(holds({ fitCount: 0 })[0]!.text).toBe("No athletes fit yet; the package needs 5");
    expect(holds({ package: { name: "Solo", priceLow: 100, athleteCountMin: 0 }, fitCount: 1 })).toEqual([]);
    expect(athletesNeeded({ name: "Solo", priceLow: 100, athleteCountMin: 0 })).toBe(1);
    expect(athletesNeeded(null)).toBe(1);
  });

  it("each sensitive category, on the brief and on the sponsor", () => {
    for (const c of SENSITIVE_CATEGORIES) {
      expect(holds({ briefCategories: [c] }).map((h) => h.key)).toEqual(["SENSITIVE"]);
      expect(holds({ sponsorCategories: [c] }).map((h) => h.key)).toEqual(["SENSITIVE"]);
      expect(holds({ sponsorCategories: [c] })[0]!.text).toMatch(/^The sponsor sells in .+, a sensitive category — BTG reviews these$/);
    }
    expect(holds({ briefCategories: ["ALCOHOL"] })[0]!.text).toBe("Alcohol is a sensitive category — BTG reviews these");
    /* On both: said once, as the brief's. */
    expect(holds({ briefCategories: ["GAMBLING"], sponsorCategories: ["GAMBLING"] })).toEqual([
      { key: "SENSITIVE", text: "Gambling is a sensitive category — BTG reviews these" },
    ]);
    /* An ordinary category is not sensitive. */
    expect(holds({ briefCategories: ["APPAREL"], sponsorCategories: ["RESTAURANT"] })).toEqual([]);
  });

  it("a sponsor on hold or closed", () => {
    expect(holds({ sponsor: { ok: false, reason: "Sponsor's account is closed" } })).toEqual([{ key: "SPONSOR", text: "Sponsor's account is closed" }]);
  });

  it("readiness failing: objective and dates", () => {
    expect(holds({ objective: "More sales" }).map((h) => h.key)).toEqual(["OBJECTIVE"]);
    expect(holds({ startDate: new Date(NOW.getTime() - DAY) }).map((h) => h.key)).toEqual(["DATES"]);
  });

  it("several at once, in a fixed order", () => {
    expect(holdKeys(holds({ package: null, fitCount: 0, sponsorCategories: ["CANNABIS"], objective: "x", sponsor: { ok: false, reason: "r" } })))
      .toEqual(["OBJECTIVE", "NO_PACKAGE", "ATHLETES", "SENSITIVE", "SPONSOR"]);
  });

  it("the daily re-check takes a brief held only for athletes", () => {
    expect(heldOnlyForAthletes(["ATHLETES"])).toBe(true);
    expect(heldOnlyForAthletes(["ATHLETES", "SENSITIVE"])).toBe(false);
    expect(heldOnlyForAthletes([])).toBe(false);
  });
});

describe("P4-BE-11 · what the sponsor is told", () => {
  it("reviewing until approved; never a reason", () => {
    expect(sponsorBriefStatus("DRAFT")).toEqual({ key: "REVIEWING", text: SPONSOR_REVIEWING });
    expect(sponsorBriefStatus("QUALIFIED")).toEqual({ key: "REVIEWING", text: SPONSOR_REVIEWING });
    expect(sponsorBriefStatus("APPROVED")).toEqual({ key: "APPROVED", text: SPONSOR_APPROVED });
    expect(sponsorBriefStatus("CAMPAIGN_CREATED")).toEqual({ key: "APPROVED", text: SPONSOR_APPROVED });
    expect(sponsorBriefStatus("CLOSED").key).toBe("CLOSED");
    expect(SPONSOR_REVIEWING).toBe("BTG is reviewing your request — usually within a working day");
    expect(SPONSOR_APPROVED).toBe("Approved — your campaign is being staffed");
  });
});

describe("P4-BE-11 · one list of sensitive categories, used in both places", () => {
  it("the 21+ disclosure is exactly the sensitive categories", () => {
    expect(Object.keys(CATEGORY_DISCLOSURES).sort()).toEqual([...SENSITIVE_CATEGORIES].sort());
  });

  it("the migration's CHECK lists every hold key", () => {
    const dir = join(__dirname, "../prisma/migrations");
    const sql = readdirSync(dir).filter((d) => d.endsWith("_brief_auto_approval")).map((d) => readFileSync(join(dir, d, "migration.sql"), "utf8")).join("\n");
    for (const k of HOLD_KEYS) expect(sql).toContain(`'${k}'`);
  });
});
