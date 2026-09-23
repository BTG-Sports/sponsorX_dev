/**
 * Image derivatives — P5-BE-07, Guide §11, §12.
 *
 * The handler for `image.derive`. Resizes an uploaded creative asset into
 * three widths as webp and records the keys on the asset.
 *
 * WHY THIS EXISTS AT ALL. `next/image` optimisation is a host-specific
 * primitive, and the portability rule says adopt those deliberately or not at
 * all. This product is image-heavy — athlete photos, property art, reward
 * graphics — so the derivatives are generated once, on upload, and served
 * straight from R2 behind a plain `<img srcSet>`. No host does anything
 * special for us, and moving host changes nothing about how images work.
 *
 * WHY WEBP AND THESE THREE WIDTHS. 320 / 640 / 1280 covers a phone, a phone
 * at 2x, and a desktop card — the three places these images actually appear.
 * webp because every browser the product supports reads it and it is roughly
 * a third the bytes of the equivalent JPEG.
 *
 * THE ORIGINAL IS NEVER REPLACED. Derivatives are additional objects beside
 * it. An athlete's master file is the thing they uploaded, and a pipeline
 * that overwrites it destroys the only copy the moment the sizes change.
 */
import sharp from "sharp";
import type pg from "pg";

export type DeriveImageJob = { assetId: string };

/** The widths, in the order they are generated. */
export const DERIVATIVE_WIDTHS = [320, 640, 1280] as const;

export type DeriveOutcome =
  | { derived: true; keys: Record<string, string> }
  | { derived: false; reason: string };

type Row = { id: string; r2Key: string; derivatives: unknown };

/** Key for one derivative. Deterministic, so a retry overwrites rather than
 *  accumulating orphans in a bucket nobody lists. */
export function derivativeKeyFor(r2Key: string, width: number): string {
  return `${r2Key}@${width}.webp`;
}

/**
 * Resize one buffer to the three widths.
 *
 * `withoutEnlargement` matters: a 200px logo asked for a 1280 derivative
 * would otherwise be upscaled into a blurry file larger than the original,
 * and the page would download it in preference to the sharp one.
 */
export async function deriveWidths(
  original: Buffer,
): Promise<{ width: number; body: Buffer }[]> {
  const out: { width: number; body: Buffer }[] = [];
  for (const width of DERIVATIVE_WIDTHS) {
    const body = await sharp(original)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    out.push({ width, body });
  }
  return out;
}

/**
 * Derive and store one asset's images.
 *
 * Storage is injected for the same reason as the QR job: the handler is
 * testable without a bucket, and the storage module keeps the credentials.
 */
export async function handleDeriveImage(
  db: pg.Pool,
  job: DeriveImageJob,
  deps: {
    getObject: (key: string) => Promise<Buffer>;
    putObject: (key: string, body: Buffer, contentType: string) => Promise<void>;
  },
): Promise<DeriveOutcome> {
  const { rows } = await db.query<Row>(
    `SELECT id, "r2Key", derivatives FROM "CreativeAsset" WHERE id = $1`,
    [job.assetId],
  );
  const asset = rows[0];
  if (!asset) return { derived: false, reason: "asset no longer exists" };
  if (asset.derivatives) return { derived: false, reason: "already derived" };

  const original = await deps.getObject(asset.r2Key);

  /* A video upload lands in the same table as a photo. sharp cannot read it,
     and that is not a failure worth retrying forever — it is a file this job
     has nothing to do with. */
  let derived: { width: number; body: Buffer }[];
  try {
    derived = await deriveWidths(original);
  } catch {
    return { derived: false, reason: "not a still image" };
  }

  const keys: Record<string, string> = {};
  for (const d of derived) {
    const key = derivativeKeyFor(asset.r2Key, d.width);
    await deps.putObject(key, d.body, "image/webp");
    keys[String(d.width)] = key;
  }

  await db.query(`UPDATE "CreativeAsset" SET derivatives = $2 WHERE id = $1`, [
    asset.id,
    JSON.stringify(keys),
  ]);

  return { derived: true, keys };
}

/**
 * The `srcSet` a plain `<img>` uses — §11's "no next/image optimisation".
 *
 * Lives here, beside the widths that produced the files, so the two cannot
 * drift: adding a width means this string changes with it.
 */
export function srcSetFor(urls: Record<string, string>): string {
  return DERIVATIVE_WIDTHS.filter((w) => urls[String(w)])
    .map((w) => `${urls[String(w)]} ${w}w`)
    .join(", ");
}
