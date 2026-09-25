import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { ForbiddenError } from "../src/auth/errors";

/* --------------------------------------------------------------------------
   GET /athletes/me — P3-FE-03, §11, §24.

   What only this endpoint can get wrong: answering an actor who IS no
   athlete (a BTG admin has no "me" here and must not be handed someone
   else's), and the shape the §24 meter derives from — the section counts
   must be counts of the athlete's own rows, and the private §26 fields may
   appear because `own` scope makes the caller the subject.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let found: Record<string, unknown> | null = null;
let lastWhere: Record<string, unknown> = {};
let acceptances = 0;

vi.mock("../src/db/client", () => ({
  prisma: {
    athlete: {
      findFirst: (args: { where: Record<string, unknown> }) => {
        lastWhere = args.where;
        return Promise.resolve(found);
      },
    },
    agreementAcceptance: {
      count: () => Promise.resolve(acceptances),
    },
  },
}));

const { getMyProfile } = await import("../src/routes/v1/athletes");

function actorWith(over: Partial<Actor>): Actor {
  return {
    userId: "u_1",
    tenantId: "tenant_1",
    roles: ["ATHLETE"],
    sponsorId: null,
    athleteId: "ath_1",
    guardianId: null,
    propertyId: null,
    ...over,
  } as Actor;
}

function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  const res = { json: (b: Record<string, unknown>) => void (body = b) };
  const done = Promise.resolve(
    getMyProfile({ actor } as never, res as never, (() => {}) as never),
  );
  return { done, body: () => body };
}

const ROW = {
  id: "ath_1",
  slug: "shammah",
  displayName: "SHAMMAH.27",
  legalName: "Shammah Okeke",
  city: "Silver Spring",
  stateCode: "MD",
  sport: "Basketball",
  position: "Forward",
  school: "Riverside High",
  level: "HIGH_SCHOOL",
  gradYear: 2027,
  achievements: null,
  state: "ACTIVE",
  tier: "CREATOR",
  contentCapabilities: ["SX-01", "SX-02"],
  brandInterests: ["APPAREL"],
  restrictedCategories: ["ALCOHOL"],
  restrictionNotes: null,
  socials: [
    { platform: "INSTAGRAM", handle: "@s", followers: 1200, avgViews: 300, source: "SELF_REPORTED" },
  ],
  _count: { rates: 3 },
};

beforeEach(() => {
  found = null;
  lastWhere = {};
  acceptances = 0;
});

describe("GET /athletes/me", () => {
  it("refuses an actor who is no athlete, before touching the database", async () => {
    const { done } = call(actorWith({ athleteId: null, roles: ["BTG_ADMIN"] }));
    await expect(done).rejects.toBeInstanceOf(ForbiddenError);
    expect(lastWhere).toEqual({});
  });

  it("answers the profile with the meter's section counts", async () => {
    found = { ...ROW };
    acceptances = 2;
    const { done, body } = call(actorWith({}));
    await done;
    expect(body()).toMatchObject({
      id: "ath_1",
      ratesConfirmed: 3,
      agreementsSigned: 2,
      restrictedCategories: ["ALCOHOL"],
    });
    expect(body()).not.toHaveProperty("_count");
  });

  it("pins the query to the actor's own athlete id on top of the scope", async () => {
    found = { ...ROW };
    const { done } = call(actorWith({}));
    await done;
    expect(lastWhere.id).toBe("ath_1");
    /* whereFor returns { AND: [scope] } since P8-SEC-02 — the spread must not
       have flattened it back into an overridable fragment. */
    expect(lastWhere.AND).toBeDefined();
  });

  it("answers an unreachable row as forbidden, like everywhere else", async () => {
    found = null;
    const { done } = call(actorWith({}));
    await expect(done).rejects.toBeInstanceOf(ForbiddenError);
  });
});
