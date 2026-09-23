/**
 * QR generation — P6-BE-06, §16.
 *
 * The handler for `reward.generateQr`. One PNG per reward token, stored in
 * the PRIVATE bucket, and the object key written back onto the token.
 *
 * WHY PRIVATE AND NOT PUBLIC. A QR is a picture of a bearer credential.
 * Anyone who can fetch the image can scan it, and the public bucket is a CDN
 * with no access control by design (§26 keeps the two policies apart). So the
 * image lives in the private bucket and reaches a person through a signed
 * URL — the same treatment as an agreement.
 *
 * WHY THE JOB, NOT THE REQUEST. Generating an image and putting it in object
 * storage is two slow things, and issuing tokens is a bulk operation: a
 * campaign hands out hundreds at once. Doing it inline would make the desk
 * wait on S3 several hundred times.
 *
 * IDEMPOTENT. A token that already has a `qrKey` is left alone. Jobs retry,
 * and a retry that generated a second image would orphan the first in a
 * bucket nobody is listing.
 */
import QRCode from "qrcode";
import type pg from "pg";

export type QrJob = { tokenId: string };

export type QrOutcome =
  | { generated: true; key: string; bytes: number }
  | { generated: false; reason: string };

type Row = { id: string; tenantId: string; token: string; qrKey: string | null };

/**
 * The URL a scan resolves to.
 *
 * Built from `APP_URL` rather than stored, so moving domain does not strand
 * every QR ever printed — though note the printed ones keep the old host, and
 * that is a redirect problem rather than a data one.
 */
export function fanUrlFor(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/r/${encodeURIComponent(token)}`;
}

/** The private-bucket key for a token's image. Deterministic, so a retry
 *  that did get as far as uploading overwrites rather than duplicates. */
export function qrKeyFor(tenantId: string, tokenId: string): string {
  return `t/${tenantId}/reward-qr/${tokenId}.png`;
}

/** Render the PNG. Separated so it is testable without a bucket. */
export async function renderQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    /* Medium recovery: enough to survive a crease or a thumb on a printed
       card, without inflating the image so far that it prints small. */
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

/**
 * Generate and store one token's QR.
 *
 * `putObject` is injected rather than imported so the job can be tested
 * without R2 — the storage module owns the bucket names and credentials.
 */
export async function handleGenerateQr(
  db: pg.Pool,
  job: QrJob,
  deps: {
    appUrl: string;
    putObject: (key: string, body: Buffer, contentType: string) => Promise<void>;
  },
): Promise<QrOutcome> {
  const { rows } = await db.query<Row>(
    `SELECT id, "tenantId", token, "qrKey" FROM "RewardToken" WHERE id = $1`,
    [job.tokenId],
  );
  const token = rows[0];
  if (!token) return { generated: false, reason: "token no longer exists" };
  if (token.qrKey) return { generated: false, reason: "already generated" };

  const png = await renderQrPng(fanUrlFor(deps.appUrl, token.token));
  const key = qrKeyFor(token.tenantId, token.id);

  await deps.putObject(key, png, "image/png");

  /* Written last. If the upload fails the row keeps a null qrKey and the job
     retries; if the update fails, the retry overwrites the same
     deterministic key rather than leaving a second orphan object. */
  await db.query(`UPDATE "RewardToken" SET "qrKey" = $2 WHERE id = $1`, [
    token.id,
    key,
  ]);

  return { generated: true, key, bytes: png.length };
}
