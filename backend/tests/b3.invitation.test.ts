import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";
import { ForbiddenError } from "../src/auth/errors";

/* --------------------------------------------------------------------------
   Inviting an athlete — P4-BE-04, §26, §37, §21.

   The shortlist in matching.ts is advisory. The invitation is the act, and
   three rules have to hold at the moment it is made, not at the moment the
   list was drawn:

     - §26 — an athlete who refused a category must not be offered it
     - §37 — a minor without a verified guardian cannot be offered paid work
     - §21 — only an ACTIVE athlete can be

   A desk that filters correctly and then invites from a tab opened an hour
   ago has still done the thing §26 forbids, which is why each is re-asked
   here rather than trusted from upstream.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let campaign: Record<string, unknown> | null = null;
let athlete: Record<string, unknown> | null = null;
let openInvite: Record<string, unknown> | null = null;
let existingInvite: Record<string, unknown> | null = null;
let created: Record<string, unknown> | null = null;
let outbox: Array<{ name: string }> = [];
let audits: string[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const ob: typeof outbox = [];
      const au: string[] = [];
      const tx = {
        campaign: { findFirst: () => Promise.resolve(campaign) },
        athlete: { findFirst: () => Promise.resolve(athlete) },
        brandRestriction: { findMany: () => Promise.resolve([]) },
    campaignInvite: {
          /* Two different lookups share this method: the open-invite guard
             filters on state, the transition fetches the row itself. */
          findFirst: ({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(where.state ? openInvite : existingInvite),
          create: ({ data }: { data: Record<string, unknown> }) => {
            created = data;
            return Promise.resolve({ id: "inv_1", state: "INVITED", expiresAt: data.expiresAt });
          },
          update: ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: "inv_1", state: data.state }),
        },
        auditLog: {
          create: ({ data }: { data: { action: string } }) => {
            au.push(data.action);
            return Promise.resolve({ id: "a" });
          },
        },
        outboxJob: {
          create: ({ data }: { data: { name: string } }) => {
            ob.push({ name: data.name });
            return Promise.resolve({ id: "j" });
          },
        },
      };
      const out = await fn(tx);
      outbox = [...outbox, ...ob];
      audits = [...audits, ...au];
      return out;
    },
  },
}));

const {
  inviteAthlete, transitionInvite, DEFAULT_INVITE_WINDOW_DAYS,
  CategoryConflictError, AthleteNotActiveError, GuardianNotVerifiedError, AlreadyInvitedError,
} = await import("../src/domain/invitation");

const actor = (roles: Role[] = ["CAMPAIGN_MGR"]): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null });

const adultActive = {
  id: "ath_1", state: "ACTIVE", restrictedCategories: [] as string[],
  birthDate: new Date("1999-01-01"), ageBand: "18_PLUS",
  guardianId: null, guardian: null,
};
const offer = { campaignId: "cmp_1", athleteId: "ath_1", jobId: "SX-02", offered: 10000 };

beforeEach(() => {
  campaign = { id: "cmp_1", brief: { categories: ["ALCOHOL", "RESTAURANT"] } };
  athlete = { ...adultActive };
  openInvite = null; existingInvite = { id: "inv_1", state: "INVITED" };
  created = null; outbox = []; audits = [];
});

describe("§26 · a refused category is refused at the invitation", () => {
  it("blocks an athlete who restricted one of the brief's categories", async () => {
    athlete = { ...adultActive, restrictedCategories: ["ALCOHOL"] };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(CategoryConflictError);
    expect(created).toBeNull();
    expect(outbox).toHaveLength(0);
  });

  it("blocks on ANY overlap, not only a total one", async () => {
    /* The bug a negated hasEvery would introduce: a brief for an alcohol
       brand with a restaurant category attached must still exclude the
       athlete who refuses alcohol. */
    athlete = { ...adultActive, restrictedCategories: ["ALCOHOL", "GAMBLING"] };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(CategoryConflictError);
  });

  it("names what conflicted, so the desk can explain the refusal", async () => {
    athlete = { ...adultActive, restrictedCategories: ["ALCOHOL"] };
    await expect(inviteAthlete(actor(), offer)).rejects.toThrow(/ALCOHOL/);
  });

  it("allows an athlete whose restrictions do not touch the brief", async () => {
    athlete = { ...adultActive, restrictedCategories: ["GAMBLING", "TOBACCO_VAPE"] };
    await expect(inviteAthlete(actor(), offer)).resolves.toMatchObject({ state: "INVITED" });
  });

  it("allows anyone when the brief names no categories at all", async () => {
    campaign = { id: "cmp_1", brief: { categories: [] } };
    athlete = { ...adultActive, restrictedCategories: ["ALCOHOL"] };
    await expect(inviteAthlete(actor(), offer)).resolves.toMatchObject({ state: "INVITED" });
  });
});

describe("§37 · a minor without a verified guardian is not offered paid work", () => {
  const minor = {
    ...adultActive,
    birthDate: new Date(Date.now() - 15 * 3.156e10), ageBand: "UNDER_16",
  };

  it("refuses when no guardian is linked", async () => {
    athlete = { ...minor, guardianId: null, guardian: null };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(GuardianNotVerifiedError);
    expect(created).toBeNull();
  });

  it("refuses when the guardian is linked but unverified", async () => {
    athlete = { ...minor, guardianId: "g1", guardian: { verifiedAt: null } };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(GuardianNotVerifiedError);
  });

  it("allows once the guardian is verified", async () => {
    athlete = { ...minor, guardianId: "g1", guardian: { verifiedAt: new Date() } };
    await expect(inviteAthlete(actor(), offer)).resolves.toMatchObject({ state: "INVITED" });
  });
});

describe("§21 · only an ACTIVE athlete can be invited", () => {
  it.each(["APPROVED", "SUBMITTED", "SUSPENDED", "REJECTED"])("refuses %s", async (state) => {
    athlete = { ...adultActive, state };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(AthleteNotActiveError);
  });
});

describe("one live offer at a time", () => {
  it("refuses a second open invitation for the same work", async () => {
    openInvite = { id: "inv_0" };
    await expect(inviteAthlete(actor(), offer)).rejects.toBeInstanceOf(AlreadyInvitedError);
  });

  it("allows a fresh invitation when the previous one is closed", async () => {
    openInvite = null; // the query only matches INVITED and VIEWED
    await expect(inviteAthlete(actor(), offer)).resolves.toMatchObject({ state: "INVITED" });
  });
});

describe("what a successful invitation does", () => {
  it("queues the notification rather than sending it", async () => {
    await inviteAthlete(actor(), offer);
    expect(outbox).toEqual([{ name: "notify.invitationSent" }]);
  });

  it("defaults the window and records it on the row", async () => {
    const before = Date.now();
    const out = await inviteAthlete(actor(), offer);
    const days = (out.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(DEFAULT_INVITE_WINDOW_DAYS, 1);
  });

  it("honours an explicit expiry", async () => {
    const expiresAt = new Date("2026-12-01");
    const out = await inviteAthlete(actor(), offer, );
    expect(out.expiresAt).toBeInstanceOf(Date);
    const explicit = await inviteAthlete(actor(), { ...offer, expiresAt });
    expect(explicit.expiresAt).toEqual(expiresAt);
  });

  it("audits the offer with its amount", async () => {
    await inviteAthlete(actor(), offer);
    expect(audits).toContain("invitation.send");
    expect(created).toMatchObject({ offered: 10000, jobId: "SX-02" });
  });
});

describe("who may invite", () => {
  it.each(["ATHLETE", "SPONSOR_ADMIN", "SPONSOR_ANALYST", "FINANCE", "SALES"] as const)(
    "refuses %s", async (role) => {
      await expect(inviteAthlete(actor([role]), offer)).rejects.toBeInstanceOf(ForbiddenError);
      expect(created).toBeNull();
    });

  it("refuses a guardian, which the matrix leaves to decision D1", async () => {
    await expect(inviteAthlete(actor(["GUARDIAN"]), offer)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("responding", () => {
  it("lets the athlete open their own invitation", async () => {
    /* ATHLETE holds `own` write on invitation — enough to answer an offer,
       and deliberately not enough to make one. */
    await expect(transitionInvite(actor(["ATHLETE"]), "inv_1", "VIEWED"))
      .resolves.toMatchObject({ state: "VIEWED" });
  });

  it("refuses an answer the state machine does not allow", async () => {
    await expect(transitionInvite(actor(["ATHLETE"]), "inv_1", "ACCEPTED"))
      .rejects.toThrow(/cannot go from INVITED to ACCEPTED/);
  });
});
