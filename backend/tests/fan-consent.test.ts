/**
 * P6-SEC-01 — "Consent is recorded with its version at claim time; no fan
 * PII leaves the system without it." §26.
 *
 * And P6-INT-02 — "A CLAIM enqueues one send carrying the code, offer,
 * pickup point and expiry; the send is idempotent so a repeat claim on an
 * existing token does not send twice."
 *
 * The two are tested together because they are the same rule seen from two
 * sides: the consent is what makes the send lawful, and the send is the only
 * thing the address is for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consentFor, CURRENT_CONSENT_VERSION, KNOWN_CONSENT_VERSIONS, mayContact,
  ConsentRequiredError, UnknownConsentVersionError, UnknownConsentPurposeError,
} from "../src/domain/fan-consent";

let token: Record<string, unknown> | null;
let writes: { model: string; data: Record<string, unknown> }[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/db/client", () => {
  const tx = {
    rewardToken: { findUnique: () => Promise.resolve(token) },
    rewardEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ model: "event", data });
        return Promise.resolve({ id: "ev_1", type: data.type });
      },
    },
    outboxJob: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ model: "outbox", data });
        return Promise.resolve({ id: "j" });
      },
    },
  };
  return { prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const { recordClaim } = await import("../src/domain/reward");

const NOW = new Date("2026-09-23T00:00:00.000Z");
const GOOD = { version: CURRENT_CONSENT_VERSION, purpose: "reward-delivery" };

beforeEach(() => {
  token = {
    id: "tok_1", tenantId: "t1", token: "OPAQUE",
    reward: {
      state: "ACTIVE", expiresAt: new Date("2027-01-01"), singleUse: true,
      offerText: "Free coffee", terms: "One per customer",
    },
  };
  writes = [];
});

describe("consent is required for an address, and only for an address", () => {
  it("returns null when no address is given — the ordinary case", () => {
    expect(consentFor(null, null, NOW)).toBeNull();
    expect(consentFor("", null, NOW)).toBeNull();
    expect(consentFor("   ", GOOD, NOW)).toBeNull();
  });

  it("records the version and the moment", () => {
    const out = consentFor("fan@example.com", GOOD, NOW)!;
    expect(out).toEqual({
      version: CURRENT_CONSENT_VERSION, purpose: "reward-delivery", at: NOW,
    });
  });

  it("refuses an address with no consent at all", () => {
    expect(() => consentFor("fan@example.com", null, NOW)).toThrow(ConsentRequiredError);
  });

  /* "They consented" stops being evidence the first time the wording is
     edited. A version that resolves to no text is not a record. */
  it("refuses a version this system has never shown", () => {
    expect(() =>
      consentFor("fan@example.com", { version: "1999-01-01", purpose: "reward-delivery" }, NOW),
    ).toThrow(UnknownConsentVersionError);
  });

  it("refuses consent with no version, even if a purpose is given", () => {
    expect(() =>
      consentFor("fan@example.com", { purpose: "reward-delivery" }, NOW),
    ).toThrow(ConsentRequiredError);
  });

  /* Agreeing to be sent a voucher is not agreeing to a mailing list. */
  it("refuses a purpose nobody was asked to agree to", () => {
    expect(() =>
      consentFor("fan@example.com", { version: CURRENT_CONSENT_VERSION, purpose: "marketing" }, NOW),
    ).toThrow(UnknownConsentPurposeError);
  });

  it("keeps every version it has ever shown", () => {
    expect(KNOWN_CONSENT_VERSIONS).toContain(CURRENT_CONSENT_VERSION);
  });
});

describe("mayContact is the gate every outbound path asks", () => {
  it("allows a consented address for the purpose it was given for", () => {
    expect(mayContact(
      { fanEmail: "f@x.test", consentVersion: "2026-09-01", consentPurpose: "reward-delivery" },
      "reward-delivery",
    )).toBe(true);
  });

  it("refuses a different purpose than the one agreed", () => {
    expect(mayContact(
      { fanEmail: "f@x.test", consentVersion: "2026-09-01", consentPurpose: "reward-delivery" },
      "marketing" as never,
    )).toBe(false);
  });

  /* Claims recorded before consent existed agreed to nothing we can prove. */
  it("refuses a row with an address but no consent", () => {
    expect(mayContact(
      { fanEmail: "f@x.test", consentVersion: null, consentPurpose: null },
      "reward-delivery",
    )).toBe(false);
  });

  it("refuses a row with no address", () => {
    expect(mayContact(
      { fanEmail: null, consentVersion: "2026-09-01", consentPurpose: "reward-delivery" },
      "reward-delivery",
    )).toBe(false);
  });
});

describe("no fan PII is written without consent", () => {
  it("writes the address and the consent together", async () => {
    await recordClaim("tk", "fan@example.com", NOW, GOOD);
    const event = writes.find((w) => w.model === "event")!;
    expect(event.data).toMatchObject({
      fanEmail: "fan@example.com",
      consentVersion: CURRENT_CONSENT_VERSION,
      consentPurpose: "reward-delivery",
    });
    expect(event.data.consentAt).toBeInstanceOf(Date);
  });

  /* THE CLAUSE. Nothing is written at all — not the claim, not the address. */
  it("writes NOTHING when an address arrives without consent", async () => {
    await expect(recordClaim("tk", "fan@example.com", NOW, null))
      .rejects.toThrow(ConsentRequiredError);
    expect(writes).toEqual([]);
  });

  it("records a claim with no address and no consent at all", async () => {
    await recordClaim("tk", null, NOW, null);
    const event = writes.find((w) => w.model === "event")!;
    expect(event.data).toMatchObject({
      type: "CLAIM", fanEmail: null, consentVersion: null, consentPurpose: null,
    });
  });
});

describe("P6-INT-02 · the fan's voucher email", () => {
  it("enqueues exactly one send, carrying code, offer, terms and expiry", async () => {
    await recordClaim("tk", "fan@example.com", NOW, GOOD);
    const sends = writes.filter((w) => w.model === "outbox");
    expect(sends).toHaveLength(1);

    const payload = sends[0]!.data.payload as Record<string, unknown>;
    expect(payload.template).toBe("reward.claimed");
    expect(payload.to).toBe("fan@example.com");
    expect(payload.data).toMatchObject({
      code: "OPAQUE",
      offerText: "Free coffee",
      terms: "One per customer",
      expiresOn: "2027-01-01",
    });
  });

  /* Idempotent on the TOKEN, so a fan who claims twice gets one email. */
  it("keys idempotency on the token, not the event", async () => {
    await recordClaim("tk", "fan@example.com", NOW, GOOD);
    await recordClaim("tk", "fan@example.com", NOW, GOOD);
    const keys = writes
      .filter((w) => w.model === "outbox")
      .map((w) => (w.data.payload as Record<string, unknown>).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
  });

  it("sends nothing when the fan gave no address", async () => {
    await recordClaim("tk", null, NOW, null);
    expect(writes.filter((w) => w.model === "outbox")).toEqual([]);
  });
});
