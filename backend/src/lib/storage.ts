/**
 * Object storage — S3 API against MinIO locally, Cloudflare R2 in staging and
 * production. Two buckets with different policies (public CDN assets vs
 * private signed agreements and creative), so every helper names its bucket.
 *
 * Architecture rule: uploads go DIRECT to storage via presigned URLs, never
 * through the app server. These helpers mint the URLs; the bytes never pass
 * through Express.
 *
 * `forcePathStyle` is required by MinIO (no per-bucket DNS locally) and is
 * accepted by R2, so it stays on unconditionally.
 *
 * ── THE PRIVATE BUCKET IS ONLY REACHABLE THROUGH AN AUDITED GRANT ───────────
 *
 * `P2-BE-08` requires that "every private grant is audited", and the only way
 * to make that true is to remove the unaudited path rather than to remember
 * to call the audit. So the raw presigners below are **not exported**: the
 * private bucket is reachable only via `presignPrivateUpload` and
 * `presignPrivateDownload`, both of which demand an actor and write the audit
 * row before returning the URL.
 *
 * Why the *grant* is the auditable event, not the upload: the browser talks
 * straight to R2, so the server never observes the PUT. The last moment we
 * can record anything is when we hand over the credential. A presigned URL is
 * a bearer token in a query string — whoever holds it, for its lifetime, is
 * the grantee.
 *
 * The audit row records the bucket, key and TTL. It deliberately does **not**
 * record the signed URL: that string *is* the credential, and copying it into
 * a table read by BTG_ADMIN would turn the audit log into a set of live keys
 * to the private bucket.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env";
import { prisma } from "../db/client";
import { AUDIT_ACTIONS, audit, type AuditActor } from "../db/audit";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const BUCKETS = {
  public: env.S3_BUCKET_PUBLIC,
  private: env.S3_BUCKET_PRIVATE,
} as const;

/**
 * Fifteen minutes. Long enough for a phone on a poor connection to finish a
 * video, short enough that a leaked URL is worth little. Guide §11.
 */
const PRESIGN_TTL_SECONDS = 15 * 60;

/**
 * What a presigned PUT pins beyond the key. P9-BE-22 — ad artwork is
 * checked on its type and size at upload, from the grant; signing both into
 * the PUT makes the stored object match what the grant recorded: a PUT with
 * another Content-Type or another length is refused by the bucket. Without
 * these the presigner signs only the host (the SDK leaves Content-Type
 * unsigned by default), as every other upload still is.
 */
export type UploadPins = { contentLength?: number; signContentType?: boolean };

/** Presigned PUT. Private-bucket callers must go through the audited wrapper. */
function presignUpload(bucket: string, key: string, contentType: string, pins: UploadPins = {}) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket, Key: key, ContentType: contentType,
      ...(pins.contentLength !== undefined ? { ContentLength: pins.contentLength } : {}),
    }),
    {
      expiresIn: PRESIGN_TTL_SECONDS,
      ...(pins.signContentType ? { signableHeaders: new Set(["content-type"]) } : {}),
    },
  );
}

/**
 * 2S1-BE-17 — five minutes, for identity and business documents BTG views:
 * a person's ID is the most sensitive file SponsorX holds, and a reviewer
 * reads it at once, so a leaked link should expire fastest.
 */
export const SENSITIVE_DOCUMENT_TTL_SECONDS = 5 * 60;

/** Presigned GET. Private-bucket callers must go through the audited wrapper. */
function presignDownload(bucket: string, key: string, ttlSeconds = PRESIGN_TTL_SECONDS) {
  /* A caller may ask for shorter, never longer. */
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: Math.min(ttlSeconds, PRESIGN_TTL_SECONDS),
  });
}

/**
 * Reject a key that tries to climb out of its prefix.
 *
 * Keys are built from user-supplied names in places (an athlete's filename),
 * and `../` in an S3 key is not traversal in the filesystem sense — but it
 * does let a caller write outside the prefix a domain function intended,
 * which is the same failure with a different mechanism. Leading slashes are
 * refused for the same reason.
 */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("//")) {
    throw new Error(`Unsafe object key: ${JSON.stringify(key)}`);
  }
}

/** What the audit row needs in order to be answerable a year later. */
type GrantContext = {
  /** The domain record this object belongs to — "Agreement", "CreativeAsset". */
  entity: string;
  entityId: string;
};

/**
 * Grant a time-limited upload to the **private** bucket, and record it.
 *
 * The audit row is written before the URL is returned, and in a transaction:
 * if the audit write fails, no credential is handed out. An unlogged grant is
 * exactly what the acceptance forbids, so failing closed is the only correct
 * behaviour.
 */
export async function presignPrivateUpload(
  actor: AuditActor,
  key: string,
  contentType: string,
  context: GrantContext,
  pins: UploadPins = {},
): Promise<string> {
  assertSafeKey(key);

  await prisma.$transaction((tx) =>
    audit(
      tx,
      actor,
      AUDIT_ACTIONS.storage.privateUploadGrant,
      context.entity,
      context.entityId,
      {
        after: {
          bucket: BUCKETS.private,
          key,
          contentType,
          ttlSeconds: PRESIGN_TTL_SECONDS,
          /* P9-BE-22 — recorded only where the PUT is pinned to it. */
          ...(pins.contentLength !== undefined ? { bytes: pins.contentLength } : {}),
        },
      },
    ),
  );

  return presignUpload(BUCKETS.private, key, contentType, pins);
}

/** Grant a time-limited read of a **private** object, and record it. */
export async function presignPrivateDownload(
  actor: AuditActor,
  key: string,
  context: GrantContext,
  ttlSeconds: number = PRESIGN_TTL_SECONDS,
): Promise<string> {
  assertSafeKey(key);

  await prisma.$transaction((tx) =>
    audit(
      tx,
      actor,
      AUDIT_ACTIONS.storage.privateDownloadGrant,
      context.entity,
      context.entityId,
      { after: { bucket: BUCKETS.private, key, ttlSeconds: Math.min(ttlSeconds, PRESIGN_TTL_SECONDS) } },
    ),
  );

  return presignDownload(BUCKETS.private, key, ttlSeconds);
}

/**
 * Grant an upload to the **public** bucket. Not audited, deliberately: the
 * bucket is world-readable by design, so a grant to write published assets
 * discloses nothing that the CDN does not already serve. Reads need no
 * signature at all — build the URL from `R2_PUBLIC_BASE_URL` instead of
 * signing one.
 */
export async function presignPublicUpload(
  key: string,
  contentType: string,
): Promise<string> {
  assertSafeKey(key);
  return presignUpload(BUCKETS.public, key, contentType);
}

/** Used by the health endpoint to prove the storage credentials work. */
export async function storageReachable(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKETS.public }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Put an object into the private bucket.
 *
 * Used by the worker, never by a request path — the jobs that call this
 * (`reward.generateQr`, `image.derive`) exist precisely so that generating
 * and storing bytes never blocks someone's HTTP response.
 *
 * No audit row: unlike a presigned grant, nothing here hands a credential to
 * a person. The auditable event is the grant that later reads the object.
 */
export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  assertSafeKey(key);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKETS.private,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Read an object back out of the private bucket. Worker-side only. */
export async function getPrivateObject(key: string): Promise<Buffer> {
  assertSafeKey(key);
  const result = await s3.send(
    new GetObjectCommand({ Bucket: BUCKETS.private, Key: key }),
  );
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error(`Object ${key} returned no readable body.`);
  }
  return Buffer.from(await body.transformToByteArray());
}

/**
 * 2S1-BE-13 — delete a private object for good: a closed account's ID and
 * verification files once their 30 days are up. Worker-side only (the
 * retention job). Deleting a key that is already gone succeeds, so a job
 * that runs twice changes nothing the second time. The caller audits the
 * deletion; nothing is handed to anyone here.
 */
export async function deletePrivateObject(key: string): Promise<void> {
  assertSafeKey(key);
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS.private, Key: key }));
}

/**
 * The stored size of a private object, or null when there is none — how the
 * server learns that a browser's direct upload actually landed (2S1-BE-02).
 * Nothing is handed to anyone, so nothing is audited.
 */
export async function privateObjectSize(key: string): Promise<number | null> {
  assertSafeKey(key);
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKETS.private, Key: key }));
    return head.ContentLength ?? 0;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (error as Error).name === "NotFound") return null;
    throw error;
  }
}

/** The CDN address of a public object — no signature, the bucket is world-readable. */
export function publicObjectUrl(key: string): string {
  assertSafeKey(key);
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}

/** Read a public object's bytes — worker-side, e.g. to embed a logo in a report that fetches nothing. */
export async function getPublicObject(key: string): Promise<Buffer | null> {
  assertSafeKey(key);
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKETS.public, Key: key }));
    const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    return body?.transformToByteArray ? Buffer.from(await body.transformToByteArray()) : null;
  } catch {
    return null;
  }
}
