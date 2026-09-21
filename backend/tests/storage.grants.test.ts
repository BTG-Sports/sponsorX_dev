import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Private grants are audited — P2-BE-08, Guide §11, §26.

   These run with no database and no network: Prisma and the S3 presigner are
   both mocked, because what is being tested is the *rule*, not AWS's signing
   or Postgres's insert. Both of those are proven elsewhere — presigning was
   verified against real R2 on 2026-09-21, and the audit helper's transaction
   behaviour is P2-BE-06's.

   The rule: a caller cannot obtain a credential for the private bucket
   without the grant being recorded. That is the half of the acceptance a
   human reviewer cannot check by reading, because it is about what happens
   when the audit write *fails*.
   -------------------------------------------------------------------------- */

const auditCalls: unknown[][] = [];
let auditThrows = false;

vi.mock("../src/db/client", () => ({
  prisma: {
    /* Enough of a transaction to run the callback and surface its rejection —
       the real client is P2-BE-06's concern, not this test's. */
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

vi.mock("../src/db/audit", async () => {
  const actual = await vi.importActual<typeof import("../src/db/audit")>("../src/db/audit");
  return {
    ...actual,
    audit: (...args: unknown[]) => {
      auditCalls.push(args);
      if (auditThrows) return Promise.reject(new Error("audit write failed"));
      return Promise.resolve();
    },
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: () =>
    Promise.resolve("https://example.invalid/signed?X-Amz-Signature=SECRET"),
}));

vi.mock("../src/config/env", () => ({
  env: {
    S3_ENDPOINT: "https://example.invalid",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_BUCKET_PUBLIC: "sponsorx-public",
    S3_BUCKET_PRIVATE: "sponsorx-private",
  },
}));

const {
  presignPrivateUpload,
  presignPrivateDownload,
  presignPublicUpload,
} = await import("../src/lib/storage");

const actor = { userId: "user_1", tenantId: "tenant_1" };
const context = { entity: "Agreement", entityId: "agr_1" };

beforeEach(() => {
  auditCalls.length = 0;
  auditThrows = false;
});

describe("private grants", () => {
  it("writes an audit row before returning an upload URL", async () => {
    const url = await presignPrivateUpload(actor, "agreements/a.pdf", "application/pdf", context);

    expect(url).toContain("X-Amz-Signature");
    expect(auditCalls).toHaveLength(1);

    const [, auditedActor, action, entity, entityId, change] = auditCalls[0] as [
      unknown,
      typeof actor,
      string,
      string,
      string,
      { after: Record<string, unknown> },
    ];
    expect(auditedActor).toEqual(actor);
    expect(action).toBe("storage.privateUploadGrant");
    expect(entity).toBe("Agreement");
    expect(entityId).toBe("agr_1");
    expect(change.after).toMatchObject({
      bucket: "sponsorx-private",
      key: "agreements/a.pdf",
      ttlSeconds: 900,
    });
  });

  it("audits a download grant too — reading a private object is a grant", async () => {
    await presignPrivateDownload(actor, "agreements/a.pdf", context);
    expect(auditCalls).toHaveLength(1);
    expect((auditCalls[0] as string[])[2]).toBe("storage.privateDownloadGrant");
  });

  it("NEVER records the signed URL itself", async () => {
    /* The URL is the credential. An audit log that stores it is a table of
       live keys to the private bucket, readable by every BTG_ADMIN. */
    await presignPrivateUpload(actor, "agreements/a.pdf", "application/pdf", context);
    expect(JSON.stringify(auditCalls)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(auditCalls)).not.toContain("SECRET");
  });

  it("hands out no credential when the audit write fails", async () => {
    auditThrows = true;
    await expect(
      presignPrivateUpload(actor, "agreements/a.pdf", "application/pdf", context),
    ).rejects.toThrow("audit write failed");
  });

  it("refuses a key that climbs out of its prefix", async () => {
    for (const key of ["../etc/passwd", "/absolute", "a//b", ""]) {
      await expect(
        presignPrivateUpload(actor, key, "text/plain", context),
      ).rejects.toThrow(/Unsafe object key/);
    }
    expect(auditCalls).toHaveLength(0);
  });
});

describe("public grants", () => {
  it("are not audited — the bucket is world-readable by design", async () => {
    const url = await presignPublicUpload("video/clip.mp4", "video/mp4");
    expect(url).toContain("X-Amz-Signature");
    expect(auditCalls).toHaveLength(0);
  });

  it("still refuse an unsafe key", async () => {
    await expect(presignPublicUpload("../x", "text/plain")).rejects.toThrow(
      /Unsafe object key/,
    );
  });
});
