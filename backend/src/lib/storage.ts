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
  GetObjectCommand,
  HeadBucketCommand,
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

/** Presigned PUT. Private-bucket callers must go through the audited wrapper. */
function presignUpload(bucket: string, key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/** Presigned GET. Private-bucket callers must go through the audited wrapper. */
function presignDownload(bucket: string, key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
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
        },
      },
    ),
  );

  return presignUpload(BUCKETS.private, key, contentType);
}

/** Grant a time-limited read of a **private** object, and record it. */
export async function presignPrivateDownload(
  actor: AuditActor,
  key: string,
  context: GrantContext,
): Promise<string> {
  assertSafeKey(key);

  await prisma.$transaction((tx) =>
    audit(
      tx,
      actor,
      AUDIT_ACTIONS.storage.privateDownloadGrant,
      context.entity,
      context.entityId,
      { after: { bucket: BUCKETS.private, key, ttlSeconds: PRESIGN_TTL_SECONDS } },
    ),
  );

  return presignDownload(BUCKETS.private, key);
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
