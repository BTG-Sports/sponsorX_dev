/* eslint-disable @typescript-eslint/no-explicit-any -- mock Prisma args are inspected structurally */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /public/properties/:slug — §9 screen 5, P2-FE-01.

   What this read must never do: name a minor, return a price, inventory,
   contact or legal name, or list an athlete who isn't public on their own
   (FEATURED / ACTIVE). Minors are counted, so the page can say so honestly.
   -------------------------------------------------------------------------- */

type Args = { where: Record<string, unknown>; select: Record<string, any> };
let lastArgs: Args | null = null;
let row: unknown = null;

vi.mock("../src/db/client", () => ({
  prisma: {
    property: {
      findFirst: (args: Args) => {
        lastArgs = args;
        return Promise.resolve(row);
      },
    },
  },
}));

const { publicProperty, PropertyNotFoundError } = await import("../src/domain/property");

const adult = (n: string) => ({
  slug: `a-${n}`, displayName: `Adult ${n}`, sport: "Football", position: "QB",
  birthDate: new Date("1999-01-01"), ageBand: null,
});

beforeEach(() => {
  lastArgs = null;
  row = {
    slug: "north-high", name: "North High", kind: "SCHOOL", city: "Bowie", stateCode: "MD",
    athletes: [
      adult("1"),
      { ...adult("band"), birthDate: null, ageBand: "18_PLUS" },
      { ...adult("unknown"), birthDate: null, ageBand: null },
      { ...adult("minor-dob"), birthDate: new Date(Date.now() - 16 * 365 * 86_400_000) },
      { ...adult("minor-band"), birthDate: null, ageBand: "16_17" },
    ],
    _count: { athletes: 5 },
  };
});

describe("the public property profile", () => {
  it("selects public athletes only, and no private column", async () => {
    await publicProperty("north-high");
    expect(lastArgs!.where).toEqual({ slug: "north-high" });
    const athletes = lastArgs!.select.athletes;
    expect(athletes.where).toEqual({ state: { in: ["FEATURED", "ACTIVE"] } });
    const cols = Object.keys(athletes.select);
    for (const banned of ["legalName", "email", "phone", "gpa"]) expect(cols).not.toContain(banned);
    const top = Object.keys(lastArgs!.select);
    for (const banned of ["zohoId", "zohoContactId", "tenantId", "publications"]) expect(top).not.toContain(banned);
  });

  it("names only CONFIRMED adults — minors and unknown age are counted, not named", async () => {
    const p = await publicProperty("north-high");
    expect(p.roster.map((a) => a.slug)).toEqual(["a-1", "a-band"]);
    expect(p.notListed).toBe(3);
    expect(p.rosterTruncated).toBe(false);
  });

  it("QA pass 9: a FEATURED athlete created with no age is never named", async () => {
    row = {
      ...(row as object),
      athletes: [{ ...adult("featured-hs"), birthDate: null, ageBand: null }],
      _count: { athletes: 1 },
    };
    const p = await publicProperty("north-high");
    expect(p.roster).toEqual([]);
    expect(p.notListed).toBe(1);
  });

  it("reads a bounded number of rows and says when there are more", async () => {
    row = { ...(row as object), _count: { athletes: 900 } };
    const p = await publicProperty("north-high");
    expect(lastArgs!.select.athletes.take).toBe(500);
    expect(p.rosterTruncated).toBe(true);
    expect(p.notListed).toBe(900 - 2);
  });

  it("returns no age signal for the athletes it does name", async () => {
    const p = await publicProperty("north-high");
    for (const a of p.roster) {
      expect(Object.keys(a).sort()).toEqual(["displayName", "position", "slug", "sport"]);
    }
  });

  it("404s an unknown slug", async () => {
    row = null;
    await expect(publicProperty("nope")).rejects.toBeInstanceOf(PropertyNotFoundError);
  });
});
