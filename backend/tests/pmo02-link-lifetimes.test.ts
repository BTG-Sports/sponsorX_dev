import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-PMO-02, owner decision 4 (2026-10-06) — link lifetimes.

   Intake, onboarding, sign-up, sponsor-request and hand-off links expire 14
   days after they are issued; unsubscribe links never do. Each kind is read
   at 13 days 23 hours (valid) and at 14 days and a minute (410, with the way
   to a fresh link). The intake token gained a purpose prefix; links sent
   before the change (undated) are accepted until LEGACY_LINKS_ACCEPTED_UNTIL
   and refused after it. An expired link is exchanged for a fresh one emailed
   to the address on file.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
/* This file's own intake tenant, so the renewal finds this file's athletes. */
const T = "pmo02_links";
process.env.PUBLIC_INTAKE_TENANT_ID = T;

const limits: string[] = [];
vi.mock("../src/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../src/lib/rate-limit")>()),
  limit: async (key: string) => void limits.push(key),
}));

const { env } = await import("../src/config/env");
const L = await import("../src/lib/signed-link");
const { issueIntakeToken, readIntakeToken } = await import("../src/lib/intake-token");
const onb = await import("../src/lib/onboarding-token");
const su = await import("../src/lib/signup-token");
const sr = await import("../src/lib/sponsor-request-token");
const pt = await import("../src/lib/purpose-token");
const { issueUnsubscribeToken, readUnsubscribeToken } = await import("../src/lib/unsubscribe-token");

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T09:00:00Z"); // after the legacy cutoff, so only dated links are in play
const VALID = new Date(T0.getTime() + 13 * DAY + 23 * 3_600_000);
const EXPIRED = new Date(T0.getTime() + 14 * DAY + 60_000);

/** What an expired read throws: 410 link_expired, naming the kind and the way back. */
function expectExpired(read: () => unknown, kind: string, path = "/api/v1/public/links/renew") {
  let thrown: unknown;
  try {
    read();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, kind).toBeInstanceOf(L.LinkExpiredError);
  const e = thrown as InstanceType<typeof L.LinkExpiredError>;
  expect(e.status).toBe(410);
  expect(e.code).toBe("link_expired");
  expect(e.details.kind).toBe(kind);
  expect(e.details.renew?.path).toBe(path);
}

describe("one lifetime: 14 days", () => {
  it("is the default, from one place", () => {
    expect(env.LINK_TTL_DAYS).toBe(14);
    expect(L.linkTtlDays()).toBe(14);
  });

  const cases: Array<[string, (now: Date) => string, (t: string, now: Date) => unknown, unknown]> = [
    ["intake", (n) => issueIntakeToken("ath_pmo", n), (t, n) => readIntakeToken(t, n), "ath_pmo"],
    ["athlete-email", (n) => su.issueAthleteEmailToken("ath_pmo", n), (t, n) => su.readAthleteEmailToken(t, n), "ath_pmo"],
    ["guardian-setup", (n) => su.issueGuardianSetupToken("g_pmo", "ath_pmo", n), (t, n) => su.readGuardianSetupToken(t, n), { guardianId: "g_pmo", athleteId: "ath_pmo" }],
    ["coming-of-age", (n) => su.issueComingOfAgeToken("ath_pmo", n), (t, n) => su.readComingOfAgeToken(t, n), "ath_pmo"],
    ["onboarding", (n) => onb.issueOnboardingToken("onb_pmo", n), (t, n) => onb.readOnboardingToken(t, n), "onb_pmo"],
    ["onboarding-email", (n) => onb.issueOnboardingEmailToken("onb_pmo", "Lee@Club.example", n), (t, n) => onb.emailTokenMatches(t, "onb_pmo", "lee@club.example", n), true],
    ["sponsor-request", (n) => sr.issueSponsorRequestToken("inq_pmo", n), (t, n) => sr.readSponsorRequestToken(t, n), "inq_pmo"],
    ["sponsor-request-email", (n) => sr.issueSponsorEmailToken("inq_pmo", n), (t, n) => sr.readSponsorEmailToken(t, n), "inq_pmo"],
    ["handoff", (n) => pt.issuePurposeToken("handoff", "gh_pmo", new Date(n.getTime() + 30 * DAY), n), (t, n) => pt.readPurposeToken("handoff", t, n), "gh_pmo"],
    ["handoff-email", (n) => pt.issuePurposeToken("handoff-email", "gh_pmo", undefined, n), (t, n) => pt.readPurposeToken("handoff-email", t, n), "gh_pmo"],
  ];

  it.each(cases)("%s: valid at 13 days 23 hours, expired at 14 days and a minute", (kind, issue, read, subject) => {
    const token = issue(T0);
    expect(read(token, VALID)).toEqual(subject);
    expectExpired(() => read(token, EXPIRED), kind);
  });

  it("account reactivation: capped at 14 days too, and points at its own by-address page", () => {
    const token = pt.issuePurposeToken("account-reactivation", "clo_pmo", new Date(T0.getTime() + 30 * DAY), T0);
    expect(pt.readPurposeToken("account-reactivation", token, VALID)).toBe("clo_pmo");
    expectExpired(() => pt.readPurposeToken("account-reactivation", token, EXPIRED), "account-reactivation", "/api/v1/public/account/reactivation-link");
  });

  it("a shorter life a link already had is kept (support: an hour)", () => {
    const token = pt.issuePurposeToken("support", "msg_pmo", new Date(T0.getTime() + 3_600_000), T0);
    expect(pt.readPurposeToken("support", token, new Date(T0.getTime() + 59 * 60_000))).toBe("msg_pmo");
    expect(() => pt.readPurposeToken("support", token, new Date(T0.getTime() + 61 * 60_000))).toThrow(L.LinkExpiredError);
  });

  it("the expiry is signed: moving it, or anything else, makes the link invalid (null), not expired", () => {
    const token = issueIntakeToken("ath_pmo", T0);
    const [id, exp, sig] = token.split(".");
    expect(readIntakeToken(`${id}.${Number(exp) + 30 * 86_400}.${sig}`, VALID)).toBeNull();
    expect(readIntakeToken(`ath_other.${exp}.${sig}`, VALID)).toBeNull();
    expect(readIntakeToken(`${id}.${exp}.${sig!.slice(0, -2)}xx`, VALID)).toBeNull();
    for (const bad of ["", "nonsense", "a.b.c.d", ".1.x", "ath.12x.sig"]) expect(readIntakeToken(bad, VALID)).toBeNull();
  });

  it("unsubscribe links never expire: still valid a year later", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(T0);
      const token = issueUnsubscribeToken("claim_pmo");
      vi.setSystemTime(new Date(T0.getTime() + 365 * DAY));
      expect(readUnsubscribeToken(token)).toBe("claim_pmo");
      vi.setSystemTime(new Date(T0.getTime() + 5 * 365 * DAY));
      expect(readUnsubscribeToken(token)).toBe("claim_pmo");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the intake token's purpose prefix", () => {
  it("an intake token is no other kind of link, and no other kind is an intake token", () => {
    const intake = issueIntakeToken("ath_pmo", T0);
    expect(su.readAthleteEmailToken(intake, VALID)).toBeNull();
    expect(su.readComingOfAgeToken(intake, VALID)).toBeNull();
    expect(onb.readOnboardingToken(intake, VALID)).toBeNull();
    expect(readUnsubscribeToken(intake)).toBeNull();
    expect(readIntakeToken(su.issueAthleteEmailToken("ath_pmo", T0), VALID)).toBeNull();
    expect(readIntakeToken(sr.issueSponsorRequestToken("ath_pmo", T0), VALID)).toBeNull();
  });
});

describe("links sent before the change (undated)", () => {
  const legacy = (secret: string, data: string, id: string) => `${id}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
  const before = new Date(L.legacyLinksAcceptedUntil().getTime() - 60_000);
  const after = new Date(L.legacyLinksAcceptedUntil().getTime() + 60_000);

  it("the cutoff defaults to the decision plus 14 days", () => {
    expect(L.legacyLinksAcceptedUntil().toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("an old intake link (HMAC of the bare id) works until the cutoff, then is refused as expired", () => {
    const old = legacy(env.INTAKE_TOKEN_SECRET, "ath_old", "ath_old");
    expect(readIntakeToken(old, before)).toBe("ath_old");
    expectExpired(() => readIntakeToken(old, after), "intake");
  });

  it("…under the previous secret too, during a rotation (the _PREVIOUS overlap applies to both formats)", async () => {
    const saved = { ...process.env };
    process.env.INTAKE_TOKEN_SECRET = "pmo02-new-secret";
    process.env.INTAKE_TOKEN_SECRET_PREVIOUS = "pmo02-old-secret";
    vi.resetModules();
    try {
      const fresh = await import("../src/lib/intake-token");
      expect(fresh.readIntakeToken(legacy("pmo02-old-secret", "ath_old", "ath_old"), before)).toBe("ath_old");
      expect(fresh.readIntakeToken(legacy("pmo02-guess", "ath_old", "ath_old"), before)).toBeNull();
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });

  it("old links of the other kinds follow the same window", () => {
    const s = env.INTAKE_TOKEN_SECRET;
    const checks: Array<[string, string, (t: string, n: Date) => unknown]> = [
      ["athlete-email", legacy(s, "athlete-email:ath_old", "ath_old"), (t, n) => su.readAthleteEmailToken(t, n)],
      ["onboarding", legacy(s, "property-onboarding:onb_old", "onb_old"), (t, n) => onb.readOnboardingToken(t, n)],
      ["onboarding-email", legacy(s, "property-onboarding-email:onb_old:lee@club.example", "onb_old"), (t, n) => onb.emailTokenMatches(t, "onb_old", "lee@club.example", n)],
      ["sponsor-request-email", legacy(s, "sponsor-request-email:inq_old", "inq_old"), (t, n) => sr.readSponsorEmailToken(t, n)],
    ];
    for (const [kind, token, read] of checks) {
      expect(read(token, before), kind).toBeTruthy();
      expectExpired(() => read(token, after), kind);
    }
  });

  it("a dated link issued under the old, longer rule (a 30-day hand-off) is accepted only until the cutoff", () => {
    const body = `gh_old.${Math.floor((before.getTime() + 25 * DAY) / 1000)}`;
    const old = `${body}.${createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(`handoff:${body}`).digest("base64url")}`;
    expect(pt.readPurposeToken("handoff", old, before)).toBe("gh_old");
    expectExpired(() => pt.readPurposeToken("handoff", old, after), "handoff");
    const never = `clo_old.0`;
    const noExpiry = `${never}.${createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(`account-reactivation:${never}`).digest("base64url")}`;
    expect(pt.readPurposeToken("account-reactivation", noExpiry, before)).toBe("clo_old");
    expect(() => pt.readPurposeToken("account-reactivation", noExpiry, after)).toThrow(L.LinkExpiredError);
  });
});

describe("LINK_TTL_DAYS is configurable", () => {
  it("a shorter lifetime applies to new links, and to links already out", async () => {
    const saved = { ...process.env };
    process.env.LINK_TTL_DAYS = "7";
    vi.resetModules();
    try {
      const s = await import("../src/lib/signup-token");
      const S = await import("../src/lib/signed-link");
      const t = s.issueAthleteEmailToken("ath_pmo", T0);
      expect(s.readAthleteEmailToken(t, new Date(T0.getTime() + 6 * DAY))).toBe("ath_pmo");
      expect(() => s.readAthleteEmailToken(t, new Date(T0.getTime() + 7 * DAY + 60_000))).toThrow(S.LinkExpiredError);
      /* A 14-day link from before the change is past one 7-day lifetime away: refused once the cutoff has passed. */
      expect(() => s.readAthleteEmailToken(su.issueAthleteEmailToken("ath_pmo", T0), new Date(T0.getTime() + DAY))).toThrow(S.LinkExpiredError);
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });

  it("refuses to boot outside 1–90 days", async () => {
    const saved = { ...process.env };
    process.env.LINK_TTL_DAYS = "0";
    vi.resetModules();
    try {
      await expect(import("../src/config/env")).rejects.toThrow();
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });
});

/* ── over HTTP, with the database ──────────────────────────────────────── */

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("an expired link over HTTP, and getting a fresh one", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const emails = async () =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } })).map(
      (j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> },
    );

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "PMO-02 links" } });
    await prisma.athlete.create({ data: { id: "pmo02_ath", tenantId: T, slug: "pmo02-ath", legalName: "Rosa Lind", displayName: "Rosa", email: "rosa@pmo02.invalid", sport: "Soccer", ageBand: "18_PLUS", state: "SUBMITTED" } });
    await prisma.inquiry.create({ data: { id: "pmo02_inq", tenantId: T, companyName: "Corner Deli", firstName: "Ana", lastName: "Ruiz", email: "ana@pmo02.invalid", source: "web-form" } });
    await prisma.propertyOnboarding.create({ data: { id: "pmo02_onb", tenantId: T, orgType: "TEAM", orgName: "Laurel Lions", contacts: [{ name: "Lee Park", email: "lee@pmo02.invalid", role: "Director", primary: true }] } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("an expired continuation link answers 410 link_expired with the way to a fresh one", async () => {
    const old = issueIntakeToken("pmo02_ath", new Date(Date.now() - 15 * DAY));
    const r = await call("GET", `/applications/intake/status?token=${encodeURIComponent(old)}`);
    expect(r.status).toBe(410);
    expect(r.json.error).toMatchObject({
      code: "link_expired", kind: "intake",
      renew: { method: "POST", path: "/api/v1/public/links/renew", body: { kind: "intake" } },
    });
    expect(r.json.error.message).toMatch(/expired/);
    /* A tampered one is still just "not found". */
    const bad = await call("GET", `/applications/intake/status?token=${encodeURIComponent(`${old}x`)}`);
    expect(bad.status).toBe(404);
  });

  it("renew: a fresh link is EMAILED to the address on file (never returned), opens, and is audited", async () => {
    const old = issueIntakeToken("pmo02_ath", new Date(Date.now() - 40 * DAY));
    const r = await call("POST", "/public/links/renew", { kind: "intake", token: old });
    expect(r).toEqual({ status: 202, json: { sent: true } });
    expect(JSON.stringify(r.json)).not.toMatch(/pmo02_ath\./);
    const mail = (await emails()).filter((m) => m.template === "link.fresh");
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: "rosa@pmo02.invalid", data: { days: "14", name: "Rosa" } });
    const t = decodeURIComponent(mail[0]!.data.url!.split("/join/confirm?t=")[1]!);
    expect(su.readAthleteEmailToken(t)).toBe("pmo02_ath");
    const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: "link.renewed" }, select: { entity: true, entityId: true } });
    expect(audits.map((a) => [a.entity, a.entityId])).toEqual([["Athlete", "pmo02_ath"]]);
    expect(limits).toContain("links:renew");
  });

  it("asked again within the hour: the same message key, so one email", async () => {
    const old = issueIntakeToken("pmo02_ath", new Date(Date.now() - 40 * DAY));
    await call("POST", "/public/links/renew", { kind: "intake", token: old });
    const keys = (await emails()).filter((m) => m.template === "link.fresh").map((m) => m.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("a tampered or foreign token, or one of the wrong kind: the same answer, and nothing sent", async () => {
    const before = (await emails()).length;
    const good = issueIntakeToken("pmo02_ath", new Date(Date.now() - 40 * DAY));
    for (const body of [
      { kind: "intake", token: `${good.slice(0, -3)}abc` },
      { kind: "intake", token: "pmo02_ath.123.forged" },
      { kind: "athlete-email", token: good },
      { kind: "sponsor-request", token: good },
    ]) {
      expect(await call("POST", "/public/links/renew", body)).toEqual({ status: 202, json: { sent: true } });
    }
    expect((await emails()).length).toBe(before);
    expect((await call("POST", "/public/links/renew", { kind: "support", token: good })).status).toBe(400);
  });

  it("a sponsor's undated request link, after the cutoff: refused, and renewed to the request's own address", async () => {
    const old = `pmo02_inq.${createHmac("sha256", env.INTAKE_TOKEN_SECRET).update("sponsor-request:pmo02_inq").digest("base64url")}`;
    /* Opens until the cutoff, 410 after it — whichever side of it this run is. */
    const open = Date.now() < L.legacyLinksAcceptedUntil().getTime();
    expect((await call("GET", `/public/sponsor-requests/${encodeURIComponent(old)}`)).status).toBe(open ? 200 : 410);
    await call("POST", "/public/links/renew", { kind: "sponsor-request", token: old });
    const mail = (await emails()).filter((m) => m.template === "link.fresh" && m.to === "ana@pmo02.invalid");
    expect(mail).toHaveLength(1);
    expect(sr.readSponsorEmailToken(decodeURIComponent(mail[0]!.data.url!.split("/sponsor-request/confirm?t=")[1]!))).toBe("pmo02_inq");
  });

  it("an onboarding email link renews only for the contact it was sent to", async () => {
    const stale = onb.issueOnboardingEmailToken("pmo02_onb", "someone-else@pmo02.invalid", new Date(Date.now() - 20 * DAY));
    await call("POST", "/public/links/renew", { kind: "onboarding-email", token: stale });
    expect((await emails()).filter((m) => m.to === "lee@pmo02.invalid")).toHaveLength(0);
    const current = onb.issueOnboardingEmailToken("pmo02_onb", "lee@pmo02.invalid", new Date(Date.now() - 20 * DAY));
    await call("POST", "/public/links/renew", { kind: "onboarding-email", token: current });
    const mail = (await emails()).filter((m) => m.to === "lee@pmo02.invalid");
    expect(mail).toHaveLength(1);
    const t = decodeURIComponent(mail[0]!.data.url!.split("/onboarding/confirm?t=")[1]!);
    expect(onb.emailTokenMatches(t, "pmo02_onb", "lee@pmo02.invalid")).toBe(true);
  });
});
