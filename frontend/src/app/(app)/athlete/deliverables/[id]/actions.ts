"use server";

import { apiFetch } from "@/server/api";
import { CAPTION_MAX, type ContentCheck } from "@/lib/content-checks";
import { deliverablePausedRefusal } from "@/lib/athlete-order-pause";
import { isDealPaused } from "@/lib/deal-disputes-live";

/* --------------------------------------------------------------------------
   P5-FE-03 — the athlete's side of a deliverable, as server actions.

   Uploads go browser → R2 directly (§11, Addendum A8): these actions only
   ask the API for a presigned PUT (the API picks the key and audits the
   grant) and then record the finished upload. The bytes never pass through
   this server. Every step returns its failure as a VALUE, because every step
   is retryable on its own — a phone that loses signal mid-upload retries the
   PUT, not the whole flow.

   P8-FE-06 — while a concern about the deal is open, every move is refused
   with 409 deal_paused (P8-BE-03). That refusal says so in words and
   carries `orderHref`: the order page, where the pause and what BTG asked
   for are shown. The deliverable read carries the orderId; the component
   doesn't, so the refusal path reads it.
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string; orderHref?: string };

type ErrorBody = { error?: { code?: string; message?: string; issues?: Array<{ message: string }> } } | null;

async function errorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return null;
  }
}

/** The order this deliverable belongs to, for the paused refusal's link; null when it can't be read. */
async function orderIdOf(deliverableId: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/deliverables/${encodeURIComponent(deliverableId)}`);
    if (!res.ok) return null;
    const d = (await res.json()) as { orderId?: unknown };
    return typeof d.orderId === "string" && d.orderId ? d.orderId : null;
  } catch {
    return null;
  }
}

async function post<T>(deliverableId: string, path: string, body: unknown, fallback: string): Promise<({ ok: true } & T) | Fail> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now — check your connection and try again." };
  }
  if (!res.ok) {
    const e = await errorBody(res);
    if (isDealPaused(res.status, e)) return deliverablePausedRefusal(await orderIdOf(deliverableId));
    return { ok: false, message: e?.error?.issues?.[0]?.message ?? e?.error?.message ?? `${fallback} (HTTP ${res.status}).` };
  }
  return { ok: true, ...((await res.json()) as T) };
}

const valid = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length < 200;

/** A presigned PUT for one file. The API chooses the key. */
export async function presignUpload(deliverableId: string, contentType: string, bytes?: number) {
  if (!valid(deliverableId) || typeof contentType !== "string" || !contentType) {
    return { ok: false, message: "That file can't be uploaded." } as Fail;
  }
  /* P5-BE-09 — the type, and the size when known, are signed into the PUT. */
  const size = typeof bytes === "number" && Number.isInteger(bytes) && bytes > 0 ? { bytes } : {};
  return post<{ url: string; key: string }>(
    deliverableId,
    `/deliverables/${encodeURIComponent(deliverableId)}/uploads`,
    { contentType, ...size },
    "Couldn't start the upload",
  );
}

/** Record a finished upload as the next creative version. */
export async function registerUpload(deliverableId: string, key: string) {
  if (!valid(deliverableId) || typeof key !== "string" || !key) {
    return { ok: false, message: "Nothing to record." } as Fail;
  }
  return post<{ id: string; version: number }>(
    deliverableId,
    `/deliverables/${encodeURIComponent(deliverableId)}/assets`,
    { r2Key: key },
    "The upload finished but couldn't be recorded",
  );
}

/**
 * NOT_STARTED → DRAFT_SUBMITTED, or a resubmission while it is back with the
 * athlete — with the caption they will post. The API runs the automatic
 * checks (P5-BE-09) and answers whether they passed; a failing draft is
 * already back on this page with each failure in words.
 */
export async function submitDraft(deliverableId: string, caption?: string) {
  if (!valid(deliverableId)) return { ok: false, message: "Nothing to submit." } as Fail;
  const text = typeof caption === "string" ? caption.trim().slice(0, CAPTION_MAX) : "";
  /* P5-BE-10 — btgReviewSkipped: it went straight to the sponsor. */
  return post<{ state: string; passed: boolean; checks: ContentCheck[]; btgReviewSkipped?: boolean }>(
    deliverableId,
    `/deliverables/${encodeURIComponent(deliverableId)}/submit`,
    text ? { caption: text } : {},
    "Couldn't submit your draft",
  );
}

/** APPROVED → PUBLISHED, with where it went live. */
export async function markPublished(deliverableId: string, publishedUrl: string) {
  if (!valid(deliverableId)) return { ok: false, message: "Nothing to publish." } as Fail;
  const url = typeof publishedUrl === "string" ? publishedUrl.trim() : "";
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, message: "Paste the full link to the live post, starting with https://" } as Fail;
  }
  return post<{ state: string }>(
    deliverableId,
    `/deliverables/${encodeURIComponent(deliverableId)}/published`,
    { publishedUrl: url },
    "Couldn't record the published link",
  );
}
