"use server";

import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   P5-FE-03 — the athlete's side of a deliverable, as server actions.

   Uploads go browser → R2 directly (§11, Addendum A8): these actions only
   ask the API for a presigned PUT (the API picks the key and audits the
   grant) and then record the finished upload. The bytes never pass through
   this server. Every step returns its failure as a VALUE, because every step
   is retryable on its own — a phone that loses signal mid-upload retries the
   PUT, not the whole flow.
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string };

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<({ ok: true } & T) | Fail> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now — check your connection and try again." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `${fallback} (HTTP ${res.status}).`) };
  return { ok: true, ...((await res.json()) as T) };
}

const valid = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length < 200;

/** A presigned PUT for one file. The API chooses the key. */
export async function presignUpload(deliverableId: string, contentType: string) {
  if (!valid(deliverableId) || typeof contentType !== "string" || !contentType) {
    return { ok: false, message: "That file can't be uploaded." } as Fail;
  }
  return post<{ url: string; key: string }>(
    `/deliverables/${encodeURIComponent(deliverableId)}/uploads`,
    { contentType },
    "Couldn't start the upload",
  );
}

/** Record a finished upload as the next creative version. */
export async function registerUpload(deliverableId: string, key: string) {
  if (!valid(deliverableId) || typeof key !== "string" || !key) {
    return { ok: false, message: "Nothing to record." } as Fail;
  }
  return post<{ id: string; version: number }>(
    `/deliverables/${encodeURIComponent(deliverableId)}/assets`,
    { r2Key: key },
    "The upload finished but couldn't be recorded",
  );
}

/** NOT_STARTED → DRAFT_SUBMITTED. */
export async function submitDraft(deliverableId: string) {
  if (!valid(deliverableId)) return { ok: false, message: "Nothing to submit." } as Fail;
  return post<{ state: string }>(
    `/deliverables/${encodeURIComponent(deliverableId)}/submit`,
    {},
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
    `/deliverables/${encodeURIComponent(deliverableId)}/published`,
    { publishedUrl: url },
    "Couldn't record the published link",
  );
}
