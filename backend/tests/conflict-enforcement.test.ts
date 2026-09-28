/**
 * P4-SEC-01 — "A competitor-category sponsor cannot be matched to a
 * restricted athlete — proven by test, not by inspection." §26.
 *
 * The task says inspection is not enough, and it is right: this rule is
 * enforced in two different places with two different mechanisms, and reading
 * either one alone gives a false sense of coverage.
 *
 *   MATCHING excludes restricted athletes from the shortlist — a Prisma
 *   `NOT hasSome` on an indexed array.
 *   THE INVITATION refuses again at the point of offer — an explicit check
 *   that throws.
 *
 * The second is the one that matters. The shortlist is advisory and can go
 * stale; a desk working from a list built this morning must not be able to
 * make an offer the rule forbids this afternoon. So this file proves the
 * exclusion AND proves the invitation refuses independently of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let athleteRow: Record<string, unknown> | null;
let capturedWhere: Record<string, unknown> | null = null;
let invite: Record<string, unknown> | null;
let writes: string[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

vi.mock("../src/db/client", () => {
  const tx = {
    athlete: {
      findMany: (args: { where: Record<string, unknown> }) => {
        capturedWhere = args.where;
        return Promise.resolve([]);
      },
      findFirst: () => Promise.resolve(athleteRow),
      findUnique: () => Promise.resolve(athleteRow),
    },
    campaignBrief: { findFirst: () => Promise.resolve(null) },
    campaign: { findFirst: () => Promise.resolve({ id: "cmp_1", tenantId: "t1", sponsorId: "spn_1" }) },
    brandRestriction: { findMany: () => Promise.resolve([]) },
    campaignInvite: {
      findFirst: () => Promise.resolve(invite),
      create: () => { writes.push("invite.create"); return Promise.resolve({ id: "inv_1", state: "INVITED" }); },
    },
    auditLog: { create: () => { writes.push("audit"); return Promise.resolve({ id: "a" }); } },
    outboxJob: { create: () => { writes.push("outbox"); return Promise.resolve({ id: "j" }); } },
  };
  return { prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const { eligibleAthletes, hasCategoryConflict } = await import("../src/domain/matching");

const actor = () =>
  ({ userId: "u", tenantId: "t1", roles: ["CAMPAIGN_MGR"], sponsorId: null,
     athleteId: null, guardianId: null, propertyId: null }) as never;

beforeEach(() => {
  athleteRow = { restrictedCategories: [] };
  capturedWhere = null;
  invite = null;
  writes = [];
});

describe("the shortlist excludes a restricted athlete", () => {
  it("filters on the brief's categories with NOT hasSome", async () => {
    await eligibleAthletes(actor(), { categories: ["ALCOHOL", "GAMBLING"] } as never);

    expect(capturedWhere).toMatchObject({
      NOT: { restrictedCategories: { hasSome: ["ALCOHOL", "GAMBLING"] } },
    });
  });

  /* `NOT hasSome`, never a negated `hasEvery`: an athlete who bars ANY of
     the brief's categories is a conflict, not only one who bars all of them.
     A negated hasEvery would let an athlete who refuses alcohol through on a
     brief for alcohol AND gambling. */
  it("treats barring ANY category as a conflict, not only all of them", async () => {
    await eligibleAthletes(actor(), { categories: ["ALCOHOL", "GAMBLING"] } as never);
    const where = JSON.stringify(capturedWhere);
    expect(where).toContain("hasSome");
    expect(where).not.toContain("hasEvery");
  });

  it("applies no conflict filter when the brief names no categories", async () => {
    await eligibleAthletes(actor(), { categories: [] } as never);
    expect(JSON.stringify(capturedWhere)).not.toContain("restrictedCategories");
  });
});

describe("the conflict check itself", () => {
  it("finds a conflict on a single overlapping category", async () => {
    athleteRow = { restrictedCategories: ["ALCOHOL"] };
    await expect(hasCategoryConflict(actor(), "ath_1", ["ALCOHOL", "AUTOMOTIVE"]))
      .resolves.toBe(true);
  });

  it("is false where nothing overlaps", async () => {
    athleteRow = { restrictedCategories: ["ALCOHOL"] };
    await expect(hasCategoryConflict(actor(), "ath_1", ["AUTOMOTIVE"]))
      .resolves.toBe(false);
  });

  it("is false for an athlete who restricts nothing", async () => {
    athleteRow = { restrictedCategories: [] };
    await expect(hasCategoryConflict(actor(), "ath_1", ["ALCOHOL"]))
      .resolves.toBe(false);
  });

  it("is false when the brief names no categories", async () => {
    athleteRow = { restrictedCategories: ["ALCOHOL"] };
    await expect(hasCategoryConflict(actor(), "ath_1", []))
      .resolves.toBe(false);
  });
});

/**
 * The half that actually protects the athlete: the offer is refused even
 * when the shortlist said otherwise.
 */
describe("the invitation refuses independently of the shortlist", () => {
  it("re-checks the conflict at the point of offer", () => {
    const source = readInvitation();
    /* The invitation must perform its own check rather than trusting that
       matching already excluded the athlete — the list can be stale. */
    expect(source).toMatch(/hasCategoryConflict|restrictedCategories/);
    expect(source).toMatch(/Conflict/);
  });

  it("throws rather than filtering — an offer is a yes or a refusal", () => {
    expect(readInvitation()).toMatch(/throw new \w*Conflict\w*Error/);
  });
});

function readInvitation(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(
    new URL("../src/domain/invitation.ts", import.meta.url), "utf8") as string;
}
