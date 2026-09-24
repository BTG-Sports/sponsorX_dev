/**
 * P6-SEC-03 — "An unsubscribe link in every fan email works without login and
 * in one tap; withdrawal is recorded against the same consent record with a
 * timestamp; a withdrawn fan is excluded at query level, not in the UI."
 *
 * One block per clause. The third clause names P6-INT-01's lead push, which
 * moved to Phase 2 on 2026-09-24 (the phase document is amended to match);
 * the exclusion is enforced where a fan is contacted today — `mayContact()`
 * at enqueue, and the send-time WHERE clause in the email worker.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env", () => ({
  env: { APP_URL: "https://sponsorx.example/", INTAKE_TOKEN_SECRET: "test-secret" },
}));

type Row = { id: string; tenantId: string; type: string; fanEmail: string | null; consentWithdrawnAt: Date | null };
let rows: Row[] = [];
const audits: string[] = [];

vi.mock("../src/db/audit", () => ({
  audit: async (_tx: unknown, _a: unknown, action: string) => { audits.push(action); },
  AUDIT_ACTIONS: {},
}));
vi.mock("../src/db/client", () => {
  const tx = {
    rewardEvent: {
      findFirst: ({ where }: { where: { id: string; type: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id && r.type === where.type && r.fanEmail) ?? null),
      update: ({ where, data }: { where: { id: string }; data: { consentWithdrawnAt: Date } }) => {
        const r = rows.find((x) => x.id === where.id)!;
        r.consentWithdrawnAt = data.consentWithdrawnAt;
        return Promise.resolve(r);
      },
    },
  };
  return { prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const { issueUnsubscribeToken, readUnsubscribeToken, unsubscribeUrl } = await import("../src/lib/unsubscribe-token");
const { issueIntakeToken } = await import("../src/lib/intake-token");
const { withdrawFanConsent } = await import("../src/domain/reward");
const { mayContact } = await import("../src/domain/fan-consent");
const { handleSendEmail, FAN_TEMPLATES, EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");

const T1 = new Date("2026-09-24T10:00:00Z");
const T2 = new Date("2026-09-25T10:00:00Z");

beforeEach(() => {
  rows = [{ id: "ev_claim", tenantId: "t1", type: "CLAIM", fanEmail: "fan@example.com", consentWithdrawnAt: null }];
  audits.length = 0;
});

describe("the link works without login", () => {
  it("round-trips the claim id through a signed token", () => {
    expect(readUnsubscribeToken(issueUnsubscribeToken("ev_claim"))).toBe("ev_claim");
  });

  it("refuses a tampered or guessed token", () => {
    const t = issueUnsubscribeToken("ev_claim");
    expect(readUnsubscribeToken(t.replace("ev_claim", "ev_other"))).toBeNull();
    expect(readUnsubscribeToken("ev_claim.notasignature")).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
  });

  it("does not accept an intake token signed with the same secret", () => {
    expect(readUnsubscribeToken(issueIntakeToken("ev_claim"))).toBeNull();
  });

  it("lands on the web app's public /u page", () => {
    expect(unsubscribeUrl("ev_claim")).toMatch(/^https:\/\/sponsorx\.example\/u\/ev_claim\./);
  });

  it("is a public route — no requireActor in front of it", () => {
    const routes = readFileSync(new URL("../src/routes/v1/rewards.ts", import.meta.url), "utf8");
    expect(routes).toContain('rewardsRouter.post("/public/unsubscribe/:token", unsubscribe);');
  });
});

describe("withdrawal is recorded on the same consent record, with a timestamp", () => {
  it("stamps the claim row and audits it", async () => {
    await expect(withdrawFanConsent(issueUnsubscribeToken("ev_claim"), T1)).resolves.toEqual({ withdrawn: true });
    expect(rows[0]!.consentWithdrawnAt).toEqual(T1);
    expect(audits).toEqual(["fan.consentWithdraw"]);
  });

  it("keeps the FIRST timestamp when tapped again", async () => {
    await withdrawFanConsent(issueUnsubscribeToken("ev_claim"), T1);
    await expect(withdrawFanConsent(issueUnsubscribeToken("ev_claim"), T2)).resolves.toEqual({ withdrawn: true });
    expect(rows[0]!.consentWithdrawnAt).toEqual(T1);
    expect(audits).toHaveLength(1);
  });

  it("answers an invalid token the same way as a claim with nothing to withdraw", async () => {
    await expect(withdrawFanConsent("junk", T1)).resolves.toEqual({ withdrawn: false });
    await expect(withdrawFanConsent(issueUnsubscribeToken("ev_missing"), T1)).resolves.toEqual({ withdrawn: false });
    expect(rows[0]!.consentWithdrawnAt).toBeNull();
  });
});

describe("a withdrawn fan is excluded at query level", () => {
  const consented = { fanEmail: "f@x.com", consentVersion: "2026-09-01", consentPurpose: "reward-delivery" };

  it("mayContact refuses a withdrawn row", () => {
    expect(mayContact(consented, "reward-delivery")).toBe(true);
    expect(mayContact({ ...consented, consentWithdrawnAt: T1 }, "reward-delivery")).toBe(false);
  });
});

describe("every fan email carries the link, and a withdrawn fan is not sent one", () => {
  const job = (over: Record<string, unknown> = {}) => ({
    tenantId: "t1", template: "reward.claimed", to: "fan@example.com",
    idempotencyKey: "reward.claimed:tok_1", fanEventId: "ev_claim",
    data: { code: "C", offerText: "Free coffee", unsubscribeUrl: "https://sponsorx.example/u/x.y" },
    ...over,
  });

  it("prints the unsubscribe link in every fan template", () => {
    for (const t of FAN_TEMPLATES) {
      expect(EMAIL_TEMPLATES[t]!({ unsubscribeUrl: "URL-MARKER" }).text).toContain("URL-MARKER");
    }
  });

  it("every enqueue of a fan template passes unsubscribeUrl and fanEventId", () => {
    const domain = readFileSync(new URL("../src/domain/reward.ts", import.meta.url), "utf8");
    for (const t of FAN_TEMPLATES) {
      const at = domain.indexOf(`template: "${t}"`);
      expect(at, `${t} is never enqueued`).toBeGreaterThan(-1);
      const block = domain.slice(at, domain.indexOf("});", at));
      expect(block).toContain("fanEventId");
      expect(block).toContain("unsubscribeUrl");
    }
  });

  it("refuses to send a fan email without the link", async () => {
    const pool = { query: vi.fn() };
    await expect(
      handleSendEmail(pool as never, job({ data: { code: "C" } }) as never),
    ).rejects.toThrow(/unsubscribeUrl/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("does not send — or claim the idempotency key — once the fan has withdrawn", async () => {
    const pool = { query: vi.fn(async () => ({ rowCount: 0, rows: [] })) };
    await expect(handleSendEmail(pool as never, job() as never)).resolves.toBe("withdrawn");
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String((pool.query.mock.calls[0] as unknown[])[0])).toContain('"consentWithdrawnAt" IS NULL');
  });
});

describe("reachable", () => {
  it("the web app serves /u/:token and forwards to the API", () => {
    const route = readFileSync(new URL("../../frontend/src/app/u/[token]/route.ts", import.meta.url), "utf8");
    expect(route).toContain("/api/v1/public/unsubscribe/");
    expect(route).toMatch(/export async function POST/);
    expect(route).toMatch(/export async function GET/);
  });
});
