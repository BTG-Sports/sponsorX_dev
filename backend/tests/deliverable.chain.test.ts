/**
 * P5-BE-08 — the approval chain — and P5-BE-06 — creative assets.
 *
 * P5-BE-08's acceptance: "BTG review, optional sponsor review, revision
 * request, approve and mark-published all work and are audited."
 *
 * "All work" is the easy half. The half worth testing is WHO may do each
 * step: §15 gives a sponsor `deliverable.approve` and deliberately no
 * `write`, so the sponsor must be able to approve and request a revision and
 * must NOT be able to submit a draft or verify one. And verification is
 * tenant-wide on purpose — the athlete who claims the work is live must not
 * be the one who confirms it, because VERIFIED is what P7-BE-02 turns into
 * money.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

let deliverable: Record<string, unknown> | null;
let auditRows: Record<string, unknown>[] = [];
let updates: Record<string, unknown>[] = [];
let committedWrites: string[] = [];
let maxVersion: number | null = null;
let outstandingDeliverables = 0;
let earningRow: Record<string, unknown> | null = null;
let enqueued: string[] = [];
let presignCalls: { key: string; contentType: string }[] = [];

vi.mock("../src/config/env", () => ({
  env: {
    APP_URL: "https://sponsorx.example",
    S3_ENDPOINT: "https://example.invalid",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_BUCKET_PUBLIC: "sponsorx-public",
    S3_BUCKET_PRIVATE: "sponsorx-private",
  },
}));

/* The presigner is mocked because what is tested here is the RULE — the key
   is server-built and the grant is issued — not AWS's signing, which
   storage.grants.test.ts already covers. Crucially it records the key, so the
   test can prove the client never chooses the path. */
vi.mock("../src/lib/storage", () => ({
  presignPrivateUpload: (
    _actor: unknown,
    key: string,
    contentType: string,
  ) => {
    presignCalls.push({ key, contentType });
    return Promise.resolve("https://r2.example.invalid/signed?X-Amz-Signature=SIG");
  },
}));

/* P4-BE-09 — the automatic campaign move verification triggers is
   tests/campaign-stages.test.ts's, on a real database. */
vi.mock("../src/domain/campaign-stages", async (actual) => ({
  ...(await actual<typeof import("../src/domain/campaign-stages")>()),
  advanceCampaign: async () => [],
  advanceCampaignOfOrder: async () => [],
}));

vi.mock("../src/db/client", () => {
  const model = {
    findFirst: () => Promise.resolve(deliverable),
    /* P7-BE-02 counts outstanding deliverables when one is verified. */
    count: () => Promise.resolve(outstandingDeliverables),
    update: ({ data }: { data: Record<string, unknown> }) => {
      committedWrites.push("deliverable.update");
      updates.push(data);
      return Promise.resolve({ id: "dlv_1", state: data.state });
    },
  };
  const tx = {
    deliverable: model,
    /* 2S1-BE-11 — the upload asks whether the uploader is a minor whose guardian should hear of it: an adult here. */
    athlete: { findFirst: () => Promise.resolve({ id: "ath_1", legalName: "Alex", displayName: "Alex", state: "ACTIVE", birthDate: null, ageBand: "18_PLUS", majorityAge: 18, guardianId: null, guardian: null }) },
    creativeAsset: {
      aggregate: () => Promise.resolve({ _max: { version: maxVersion } }),
      create: ({ data }: { data: Record<string, unknown> }) => {
        committedWrites.push("asset.create");
        return Promise.resolve({ id: "ast_1", version: data.version });
      },
    },
    /* P7-BE-02 — releasing the order's earning to ELIGIBLE. */
    earning: {
      findUnique: () => Promise.resolve(earningRow),
      update: ({ data }: { data: Record<string, unknown> }) => {
        committedWrites.push("earning.update");
        return Promise.resolve({ id: "ern_1", state: data.state });
      },
    },
    /* P5-BE-07 — registering an asset queues its derivatives. */
    outboxJob: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        committedWrites.push("outbox");
        enqueued.push(data.name as string);
        return Promise.resolve({ id: "j" });
      },
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        committedWrites.push("audit");
        auditRows.push(data);
        return Promise.resolve({ id: "a" });
      },
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const {
  submitDraft, startBtgReview, sendToSponsorReview, requestRevision,
  approveDeliverable, markPublished, verifyPublished,
  presignCreativeUpload, registerCreativeAsset,
  PublishedUrlRequiredError, RevisionReasonRequiredError,
} = await import("../src/domain/deliverable");

const actor = (roles: Role[], extra: Partial<Actor> = {}): Actor =>
  ({
    userId: "u", tenantId: "t1", roles,
    sponsorId: null, athleteId: "ath_1", guardianId: null,
    ...extra,
  }) as Actor;

const athlete = () => actor(["ATHLETE"]);
const btg = () => actor(["CAMPAIGN_MGR"], { athleteId: null });
const sponsor = () => actor(["SPONSOR_ADMIN"], { athleteId: null, sponsorId: "spn_1" });

const at = (state: string) => {
  deliverable = {
    id: "dlv_1", state, tenantId: "t1", orderId: "ord_1", title: "Story drop",
    /* P5-INT-01 widened move()'s read so a notification can be addressed. */
    order: {
      campaign: { name: "Autumn" },
      athlete: { displayName: "Alex", user: { email: "alex@example.com" } },
    },
  };
};

beforeEach(() => {
  at("NOT_STARTED");
  auditRows = [];
  updates = [];
  committedWrites = [];
  maxVersion = null;
  presignCalls = [];
  outstandingDeliverables = 0;
  earningRow = { id: "ern_1", state: "PENDING" };
  enqueued = [];
});

describe("P5-BE-08 · every step of the chain works and is audited", () => {
  it("the athlete submits a draft", async () => {
    at("NOT_STARTED");
    const out = await submitDraft(athlete(), "dlv_1");
    expect(out.state).toBe("DRAFT_SUBMITTED");
    expect(auditRows[0]!.action).toBe("deliverable.submitDraft");
  });

  it("BTG picks it up for review", async () => {
    at("DRAFT_SUBMITTED");
    const out = await startBtgReview(btg(), "dlv_1");
    expect(out.state).toBe("BTG_REVIEW");
    expect(auditRows[0]!.action).toBe("deliverable.btgReview");
  });

  it("BTG routes it to the sponsor — the optional step", async () => {
    at("BTG_REVIEW");
    const out = await sendToSponsorReview(btg(), "dlv_1");
    expect(out.state).toBe("SPONSOR_REVIEW");
    expect(auditRows[0]!.action).toBe("deliverable.sponsorReview");
  });

  it("BTG may approve without the sponsor ever seeing it", async () => {
    at("BTG_REVIEW");
    const out = await approveDeliverable(btg(), "dlv_1");
    expect(out.state).toBe("APPROVED");
  });

  it("a revision returns it to DRAFT_SUBMITTED with the reason on the log", async () => {
    at("SPONSOR_REVIEW");
    const out = await requestRevision(sponsor(), "dlv_1", "Logo is cropped");
    expect(out.state).toBe("DRAFT_SUBMITTED");
    expect(auditRows[0]!.action).toBe("deliverable.requestRevision");
    expect(auditRows[0]!.after).toMatchObject({ reason: "Logo is cropped" });
  });

  it("the athlete marks it published, recording where", async () => {
    at("APPROVED");
    const out = await markPublished(athlete(), "dlv_1", "https://instagram.com/p/abc");
    expect(out.state).toBe("PUBLISHED");
    expect(updates[0]).toMatchObject({ publishedUrl: "https://instagram.com/p/abc" });
    expect(updates[0]!.publishedAt).toBeInstanceOf(Date);
  });

  it("BTG verifies the published work", async () => {
    at("PUBLISHED");
    const out = await verifyPublished(btg(), "dlv_1");
    expect(out.state).toBe("VERIFIED");
    expect(auditRows[0]!.action).toBe("deliverable.verify");
  });

  it("every step writes exactly one audit row", async () => {
    at("DRAFT_SUBMITTED");
    await startBtgReview(btg(), "dlv_1");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.entity).toBe("Deliverable");
    expect(auditRows[0]!.entityId).toBe("dlv_1");
  });
});

describe("the chain refuses illegal moves", () => {
  it("cannot jump from NOT_STARTED to VERIFIED", async () => {
    at("NOT_STARTED");
    await expect(verifyPublished(btg(), "dlv_1")).rejects.toThrow(/NOT_STARTED to VERIFIED/);
    expect(committedWrites).toEqual([]);
  });

  it("cannot approve work that has not been reviewed", async () => {
    at("DRAFT_SUBMITTED");
    await expect(approveDeliverable(btg(), "dlv_1")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
  });
});

describe("who may do what — §15, not a comment", () => {
  /* A sponsor judges the work; they do not make it. */
  it("a sponsor may approve", async () => {
    at("SPONSOR_REVIEW");
    await expect(approveDeliverable(sponsor(), "dlv_1")).resolves.toMatchObject({
      state: "APPROVED",
    });
  });

  it("a sponsor may request a revision", async () => {
    at("SPONSOR_REVIEW");
    await expect(requestRevision(sponsor(), "dlv_1", "Wrong hashtag")).resolves.toMatchObject(
      { state: "DRAFT_SUBMITTED" },
    );
  });

  it("a sponsor may NOT submit a draft — they have no deliverable.write", async () => {
    at("NOT_STARTED");
    await expect(submitDraft(sponsor(), "dlv_1")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
  });

  /* Verification is tenant-wide: the athlete who says it is live must not be
     the one who confirms it, because VERIFIED becomes money. */
  it("an athlete may NOT verify their own published work", async () => {
    at("PUBLISHED");
    await expect(verifyPublished(athlete(), "dlv_1")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
  });

  it("an athlete may NOT start the BTG review", async () => {
    at("DRAFT_SUBMITTED");
    await expect(startBtgReview(athlete(), "dlv_1")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
  });
});

describe("the two mandatory inputs", () => {
  it("a revision request needs a reason", async () => {
    at("BTG_REVIEW");
    await expect(requestRevision(btg(), "dlv_1", "   ")).rejects.toThrow(
      RevisionReasonRequiredError,
    );
    expect(committedWrites).toEqual([]);
  });

  it("marking published needs the URL", async () => {
    at("APPROVED");
    await expect(markPublished(athlete(), "dlv_1", "")).rejects.toThrow(
      PublishedUrlRequiredError,
    );
    expect(committedWrites).toEqual([]);
  });
});

describe("P5-BE-06 · creative goes straight to R2", () => {
  it("hands back a presigned URL and the key", async () => {
    at("NOT_STARTED");
    const out = await presignCreativeUpload(athlete(), "dlv_1", "video/mp4");
    expect(out.url).toContain("X-Amz-Signature");
    expect(out.key).toBe(presignCalls[0]!.key);
  });

  /* The server builds the key. A client-chosen key is a client-chosen path,
     and a presigned PUT against it is a write primitive into anyone's
     folder. */
  it("builds the key itself, under the tenant and the deliverable", async () => {
    at("NOT_STARTED");
    const out = await presignCreativeUpload(athlete(), "dlv_1", "video/mp4");
    expect(out.key).toMatch(/^t\/t1\/deliverable\/dlv_1\/[0-9a-f-]{36}$/);
  });

  it("gives a different key every time, so an upload never overwrites another", async () => {
    at("NOT_STARTED");
    const a = await presignCreativeUpload(athlete(), "dlv_1", "video/mp4");
    const b = await presignCreativeUpload(athlete(), "dlv_1", "video/mp4");
    expect(a.key).not.toBe(b.key);
  });

  it("issues no credential for a deliverable the actor cannot reach", async () => {
    deliverable = null;
    await expect(presignCreativeUpload(athlete(), "dlv_1", "video/mp4")).rejects.toThrow();
    expect(presignCalls).toEqual([]);
  });

  it("registers the first asset as version 1", async () => {
    at("DRAFT_SUBMITTED");
    maxVersion = null;
    await expect(registerCreativeAsset(athlete(), "dlv_1", "t/t1/deliverable/dlv_1/x"))
      .resolves.toMatchObject({ version: 1 });
  });

  it("allocates the next version from the current maximum", async () => {
    at("DRAFT_SUBMITTED");
    maxVersion = 3;
    await expect(registerCreativeAsset(athlete(), "dlv_1", "t/t1/deliverable/dlv_1/x"))
      .resolves.toMatchObject({ version: 4 });
  });

  it("audits the registration against the deliverable", async () => {
    at("DRAFT_SUBMITTED");
    await registerCreativeAsset(athlete(), "dlv_1", "t/t1/deliverable/dlv_1/x");
    expect(auditRows[0]!.action).toBe("deliverable.assetRegister");
    expect(auditRows[0]!.entityId).toBe("dlv_1");
  });
});
