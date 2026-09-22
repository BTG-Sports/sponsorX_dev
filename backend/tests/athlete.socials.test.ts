import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { ForbiddenError } from "../src/auth/errors";
import type { Role } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   Social accounts and provenance — P3-BE-04, §11 §3, §22.

   The acceptance names the columns, and the columns have existed since
   P2-BE-02. What had never been true is that anything could change them after
   the application closed, and what is worth testing is the rule that governs
   the change: **the caller does not choose the provenance label.**

   §22 calls the label the project's biggest credibility risk. A caller who
   can set their own removes its meaning — an athlete would mark their own
   follower count VERIFIED_MANUAL and every downstream screen would repeat it
   as checked.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: Array<Record<string, unknown>> = [];
let audits: Array<{ action: string; after: unknown }> = [];
let athleteExists = true;

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const staged = [...rows];
      const au: typeof audits = [];
      const tx = {
        athlete: { findFirst: () => Promise.resolve(athleteExists ? { id: "ath_1" } : null) },
        athleteSocial: {
          findMany: () => Promise.resolve(staged.map((r) => ({ ...r }))),
          deleteMany: () => { staged.length = 0; return Promise.resolve({ count: 0 }); },
          createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
            staged.push(...data);
            return Promise.resolve({ count: data.length });
          },
        },
        auditLog: {
          create: ({ data }: { data: { action: string; after: unknown } }) => {
            au.push({ action: data.action, after: data.after });
            return Promise.resolve({ id: "a" });
          },
        },
      };
      const out = await fn(tx);
      rows = staged; audits = [...audits, ...au];
      return out;
    },
  },
}));

const { recordSocials } = await import("../src/domain/athlete-social");

const actor = (roles: Role[]): Actor => ({ userId: "u", tenantId: "t1", roles });
const account = {
  platform: "INSTAGRAM" as const, handle: "jreed", followers: 9000,
  /* The caller claims a verified label. It must not survive. */
  source: "VERIFIED_API" as const,
};

beforeEach(() => { rows = []; audits = []; athleteExists = true; });

describe("the caller does not choose the provenance", () => {
  it("labels an athlete's own edit SELF_REPORTED, whatever they sent", async () => {
    const out = await recordSocials(actor(["ATHLETE"]), "ath_1", [account]);
    expect(out.source).toBe("SELF_REPORTED");
    expect(rows[0]?.source).toBe("SELF_REPORTED");
  });

  it("labels a guardian's edit SELF_REPORTED too", async () => {
    const out = await recordSocials(actor(["GUARDIAN"]), "ath_1", [account]);
    expect(out.source).toBe("SELF_REPORTED");
  });

  it.each(["NETWORK_MGR", "BTG_ADMIN", "SUPER_ADMIN"] as const)(
    "lets %s record that a number was actually checked", async (role) => {
      const out = await recordSocials(actor([role]), "ath_1", [account]);
      expect(out.source).toBe("VERIFIED_MANUAL");
    });

  it("does not demote a BTG staffer who is also an athlete in the network", async () => {
    /* scopeFor returns the widest of an actor's roles, so a naive scope
       comparison would read this person as self-scoped and silently take
       their ability to verify away. */
    const out = await recordSocials(actor(["NETWORK_MGR", "ATHLETE"]), "ath_1", [account]);
    expect(out.source).toBe("VERIFIED_MANUAL");
  });

  it("never offers VERIFIED_API, which nothing can perform in Phase 1", async () => {
    const out = await recordSocials(actor(["SUPER_ADMIN"]), "ath_1", [account]);
    expect(out.source).not.toBe("VERIFIED_API");
  });
});

describe("recording the set", () => {
  it("replaces wholesale, so an account can be removed", async () => {
    await recordSocials(actor(["ATHLETE"]), "ath_1", [account]);
    expect(rows).toHaveLength(1);
    await recordSocials(actor(["ATHLETE"]), "ath_1", []);
    expect(rows).toHaveLength(0);
  });

  it("stamps capturedAt, because a labelled number needs a date", async () => {
    await recordSocials(actor(["ATHLETE"]), "ath_1", [account]);
    expect(rows[0]?.capturedAt).toBeInstanceOf(Date);
  });

  it("keeps followers and avgViews, and nulls what was not given", async () => {
    await recordSocials(actor(["ATHLETE"]), "ath_1", [account]);
    expect(rows[0]).toMatchObject({ followers: 9000, avgViews: null, handle: "jreed" });
  });

  it("audits the change with the label it applied", async () => {
    await recordSocials(actor(["NETWORK_MGR"]), "ath_1", [account]);
    expect(audits[0]?.action).toBe("athlete.socialsRecord");
    expect(audits[0]?.after).toMatchObject({ source: "VERIFIED_MANUAL" });
  });
});

describe("who may touch them at all", () => {
  it.each(["SPONSOR_ADMIN", "SPONSOR_ANALYST", "FINANCE", "SALES", "SERVICE"] as const)(
    "refuses %s", async (role) => {
      await expect(recordSocials(actor([role]), "ath_1", [account]))
        .rejects.toBeInstanceOf(ForbiddenError);
      expect(rows).toHaveLength(0);
    });

  it("answers an athlete in another tenant as a denial", async () => {
    athleteExists = false;
    await expect(recordSocials(actor(["NETWORK_MGR"]), "ath_1", [account]))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
