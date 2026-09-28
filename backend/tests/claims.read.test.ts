import { describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /claims — P9-FE-08. Pinned: the claim rows are listClaims' (scoped by
   whereFor(athleteClaim)); each is joined only to the claimed profile's
   public fields — never the athlete's legal name, email or birth date; a
   role outside the claim matrix is refused.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const athleteSelect: unknown[] = [];
vi.mock("../src/db/client", () => ({
  prisma: {
    athleteClaim: {
      findMany: async () => [
        { id: "c1", athleteId: "a1", claimantName: "Amara Whitfield", claimantEmail: "amara@example.com", rosterMatched: true, state: "SUBMITTED", createdAt: new Date("2026-09-27T00:00:00Z") },
      ],
    },
    athlete: {
      findMany: async (a: { select: unknown }) => (athleteSelect.push(a.select), [
        { id: "a1", displayName: "Amara W.", slug: "amara-w-1a2b3c", sport: "Track", state: "FEATURED" },
      ]),
    },
  },
}));

const { claims } = await import("../src/routes/v1/rights");

const base = { userId: "u", tenantId: "t", guardianId: null, sponsorId: null, athleteId: null, studentId: null };
const advisor = { ...base, propertyId: "p1", roles: ["ADVISOR"] } as unknown as Actor;
const sponsor = { ...base, propertyId: null, sponsorId: "s1", roles: ["SPONSOR_ADMIN"] } as unknown as Actor;

async function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  await (claims as unknown as (...a: unknown[]) => Promise<void>)({ actor }, { json: (b: Record<string, unknown>) => void (body = b) }, () => {});
  return body!;
}

describe("GET /claims", () => {
  it("joins each claim to the profile's public fields only", async () => {
    const [c] = (await call(advisor)).claims as Array<Record<string, unknown>>;
    expect(c).toMatchObject({ id: "c1", rosterMatched: true, athlete: { displayName: "Amara W.", slug: "amara-w-1a2b3c", sport: "Track", state: "FEATURED" } });
    expect(Object.keys(athleteSelect[0] as object).sort()).toEqual(["displayName", "id", "slug", "sport", "state"]);
  });
  it("is refused outside the claim matrix", async () => {
    await expect(call(sponsor)).rejects.toThrow();
  });
});
