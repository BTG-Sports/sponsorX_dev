/**
 * Object storage — S3 API against MinIO locally, Cloudflare R2 in staging and
 * production. Two buckets with different policies (blueprint §: public CDN
 * assets vs private signed agreements/creative), so every helper takes the
 * bucket explicitly.
 *
 * Architecture rule: uploads go DIRECT to storage via presigned URLs, never
 * through the app server. These helpers mint the URLs; the bytes never pass
 * through Express.
 *
 * `forcePathStyle` is required by MinIO (no per-bucket DNS locally) and is
 * accepted by R2, so it stays on unconditionally.
 */
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

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

const PRESIGN_TTL_SECONDS = 15 * 60;

/** Presigned PUT — the browser uploads straight to storage with this URL. */
export function presignUpload(
  bucket: string,
  key: string,
  contentType: string,
) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/** Presigned GET — time-limited read access to a private object. */
export function presignDownload(bucket: string, key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
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
