import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { findRestricted, normalizeEntry, STARTER_WORDS, tokens } from "../src/domain/restricted-words-rules";

/* --------------------------------------------------------------------------
   2S1-BE-18 — the restricted-words check. Done when:

     Free text containing a listed word, including disguised spellings, is
     marked restricted with what matched; innocent words that merely contain
     a listed word are not; BTG admins can edit the list and every change is
     audited; a match routes the item to BTG's review and never rejects it.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@rw-test.invalid` } : null;
  },
}));

const LIST = STARTER_WORDS.map((w) => ({ word: w.word, normalized: normalizeEntry(w.word), kind: w.kind }));
const hits = (text: string) => findRestricted(text, LIST).map((m) => m.word);

describe("matching (pure)", () => {
  it("finds listed words and phrases, with their kind", () => {
    expect(findRestricted("We run an adult entertainment venue", LIST)).toEqual([{ word: "adult entertainment", kind: "ADULT" }]);
    expect(hits("Neighbourhood cannabis dispensary")).toEqual(["cannabis", "dispensary"]);
    expect(hits("Licensed gun shop and range")).toEqual(["gun", "gun shop"]);
  });

  it("sees through disguised spellings", () => {
    expect(hits("S3X shop")).toContain("sex shop");
    expect(hits("s.e.x toys")).toEqual(["sex"]);
    expect(hits("we sell d r u g s")).toEqual(["drug"]);
    expect(hits("C0CAINE")).toEqual(["cocaine"]);
    expect(hits("cöcaine imports")).toEqual(["cocaine"]);
    expect(hits("p0rn")).toEqual(["porn"]);
    expect(hits("Ca$ino nights")).toEqual(["casino"]);
  });

  it("matches a listed word's plain plural", () => {
    expect(hits("firearms and ammunition")).toEqual(["firearm", "ammunition"]);
    expect(hits("discount drugs")).toEqual(["drug"]);
  });

  it("leaves innocent words that merely contain a listed one alone", () => {
    for (const ok of ["Essex Café", "Sussex Bakery", "Middlesex Dental", "Skill Academy", "Weeding & Lawn Care", "Gunnison Outfitters",
      "Methodist Youth Group", "Killarney Pub Grill", "Escortia Travel", "Pokerface Barbers"]) {
      expect(hits(ok), ok).toEqual([]);
    }
  });

  it("an ordinary business has no matches", () => {
    expect(hits("Coffee shop / café")).toEqual([]);
    expect(hits("Family dentist")).toEqual([]);
    expect(hits("")).toEqual([]);
  });

  it("normalises entries the way it reads text", () => {
    expect(normalizeEntry("  Strip  Club ")).toBe("strip club");
    expect(tokens("Ex-Lax, d.r.u.g.s!")).toEqual(["ex", "lax", "drugs"]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-18 · BTG keeps the list", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { checkRestricted } = await import("../src/domain/restricted-words");

  const T = "rw_btg";
  const X = "rw_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  async function clean() {
    for (const t of [T, X]) {
      await prisma.restrictedWord.deleteMany({ where: { tenantId: t } });
      await prisma.auditLog.deleteMany({ where: { tenantId: t } });
      await prisma.user.deleteMany({ where: { tenantId: t } });
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, X] } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Words BTG" }, { id: X, name: "Other BTG" }] });
    await prisma.user.createMany({ data: [
      { id: "rw_admin", tenantId: T, clerkId: "rw_admin", email: "rw_admin@rw-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "rw_sales", tenantId: T, clerkId: "rw_sales", email: "rw_sales@rw-test.invalid", roles: ["SALES"] },
      { id: "rw_x_admin", tenantId: X, clerkId: "rw_x_admin", email: "rw_x_admin@rw-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("the list starts from the starter words, grouped by kind", async () => {
    const r = await call("GET", "/restricted-words", "rw_admin");
    expect(r.status, r.text).toBe(200);
    expect(r.json.words).toHaveLength(STARTER_WORDS.length);
    expect(r.json.kinds.map((k: { label: string }) => k.label)).toEqual(["Adult", "Drugs", "Weapons", "Gambling", "Violence and hate", "Other illegal"]);
    expect(r.json.words.find((w: { word: string }) => w.word === "cocaine")).toMatchObject({ kind: "DRUGS", active: true, addedBy: "starter" });
  });

  it("BTG adds a word, it matches straight away, and the change is audited", async () => {
    expect((await call("POST", "/restricted-words/test", "rw_admin", { text: "Hookah lounge" })).json).toEqual({ restricted: false, matches: [] });
    const add = await call("POST", "/restricted-words", "rw_admin", { word: "Hookah", kind: "DRUGS" });
    expect(add.status, add.text).toBe(201);
    expect((await call("POST", "/restricted-words/test", "rw_admin", { text: "H00KAH lounge" })).json)
      .toEqual({ restricted: true, matches: [{ word: "Hookah", kind: "DRUGS", label: "Drugs" }] });
    expect((await call("POST", "/restricted-words", "rw_admin", { word: "hookah", kind: "DRUGS" })).status).toBe(409);
  });

  it("removing a word stops it matching, keeps its row, and adding it back reactivates it", async () => {
    const list = (await call("GET", "/restricted-words", "rw_admin")).json.words as { id: string; word: string }[];
    const kill = list.find((w) => w.word === "kill")!;
    const off = await call("DELETE", `/restricted-words/${kill.id}`, "rw_admin");
    expect(off.status, off.text).toBe(200);
    expect(off.json.active).toBe(false);
    expect(await checkRestricted(prisma, T, "Kill Devil Hills surf shop")).toEqual([]);
    expect((await call("DELETE", `/restricted-words/${kill.id}`, "rw_admin")).status).toBe(409);
    const back = await call("POST", "/restricted-words", "rw_admin", { word: "kill", kind: "VIOLENCE_HATE" });
    expect(back.json).toMatchObject({ id: kill.id, active: true });
    const history = (await call("GET", "/restricted-words/history", "rw_admin")).json.history;
    expect(history.slice(0, 3).map((h: { change: string; word: string; by: string }) => [h.change, h.word, h.by])).toEqual([
      ["added", "kill", "rw_admin@rw-test.invalid"],
      ["removed", "kill", "rw_admin@rw-test.invalid"],
      ["added", "Hookah", "rw_admin@rw-test.invalid"],
    ]);
  });

  it("only BTG admins keep the list, and each tenant's list is its own", async () => {
    for (const [m, p, b] of [["GET", "/restricted-words", undefined], ["POST", "/restricted-words", { word: "x-rated", kind: "ADULT" }], ["POST", "/restricted-words/test", { text: "x" }]] as const) {
      expect((await call(m, p, "rw_sales", b)).status, `${m} ${p}`).toBe(403);
      expect((await call(m, p, undefined, b)).status, `${m} ${p} anon`).toBe(401);
    }
    const mine = (await call("GET", "/restricted-words", "rw_admin")).json.words as { id: string; word: string }[];
    const hookah = mine.find((w) => w.word === "Hookah")!;
    expect((await call("DELETE", `/restricted-words/${hookah.id}`, "rw_x_admin")).status).toBe(403);
    const theirs = (await call("GET", "/restricted-words", "rw_x_admin")).json.words as { word: string }[];
    expect(theirs.map((w) => w.word)).not.toContain("Hookah");
    expect(await checkRestricted(prisma, X, "Hookah lounge")).toEqual([]);
  });

  it("a match only reports — the check has no way to reject anything", async () => {
    const matches = await checkRestricted(prisma, T, "Craft brewery with poker nights");
    expect(matches).toEqual([{ word: "poker", kind: "GAMBLING" }]);
    expect(await checkRestricted(prisma, T, null)).toEqual([]);
  });
});
