"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import type { SponsorMove } from "@/lib/edition-artwork-live";

/* --------------------------------------------------------------------------
   P9-BE-16 — the sponsor's side of their SponsorX NEXT ad artwork.

   Upload: the athlete upload's flow, reused — the API presigns a PUT to the
   private bucket for THIS slot (it picks the key), the browser sends the
   bytes straight there, then the key is recorded as the slot's artwork.
   Decide: Approve or Request changes, once BTG has sent it. The API's matrix
   decides who may (the buying sponsor's admin only), audits, and emails BTG.
   Every failure comes back as a value for the panel to show.
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

function refresh() {
  revalidatePath("/(app)/sponsor/campaigns/[id]", "page");
}

/** A presigned PUT for the slot's artwork file. The API chooses the key;
 *  P9-BE-22 — the file's size is signed into the PUT with its type, and the
 *  upload's automatic checks read both. */
export async function presignArtwork(slotId: string, contentType: string, bytes?: number) {
  if (!valid(slotId) || typeof contentType !== "string" || !contentType) return { ok: false, message: "That file can't be uploaded." } as Fail;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) return { ok: false, message: "That file is empty — choose another." } as Fail;
  return post<{ url: string; key: string }>(`/ad-slots/${encodeURIComponent(slotId)}/artwork/uploads`, { contentType, bytes }, "Couldn't start the upload");
}

/** Record the finished upload as the slot's artwork. P9-BE-22 — it is checked
 *  at once: back to you with the reasons, on to BTG, or — for a sponsor whose
 *  recent ads were approved without changes — straight to your review. */
export async function registerArtwork(slotId: string, key: string) {
  if (!valid(slotId) || typeof key !== "string" || !key) return { ok: false, message: "Nothing to record." } as Fail;
  const r = await post<{ id: string; state: string; version: number; route?: string; btgReviewSkipped?: boolean }>(
    `/ad-slots/${encodeURIComponent(slotId)}/artwork`,
    { r2Key: key },
    "The upload finished but couldn't be recorded",
  );
  if (r.ok) refresh();
  return r;
}

/** Approve, or Request changes with a note — the buying sponsor's sign-off. */
export async function sponsorArtworkAction(id: string, kind: SponsorMove, note?: string) {
  if (!valid(id) || (kind !== "approve" && kind !== "revision")) return { ok: false, message: "Unknown decision." } as Fail;
  const trimmed = note?.trim() ?? "";
  if (kind === "revision" && !trimmed) return { ok: false, message: "Say what needs to change — BTG gets these words." } as Fail;
  const r = await post<{ state: string }>(
    `/edition-artwork/${encodeURIComponent(id)}/${kind}`,
    kind === "revision" ? { reason: trimmed } : {},
    "The decision was not accepted",
  );
  if (r.ok) refresh();
  return r;
}

/* --------------------------------------------------------------------------
   P5-BE-09 / P4-FE-08 — the sponsor's sign-off on athlete content waiting in
   SPONSOR_REVIEW. The API's matrix decides (a sponsor approves on their own
   campaigns, §15), audits, and tells the athlete.
   -------------------------------------------------------------------------- */

/** Approve, or Request changes with a note — the athlete gets the words. */
export async function sponsorContentAction(id: string, kind: "approve" | "revision", note?: string) {
  if (!valid(id) || (kind !== "approve" && kind !== "revision")) return { ok: false, message: "Unknown decision." } as Fail;
  const trimmed = note?.trim() ?? "";
  if (kind === "revision" && !trimmed) return { ok: false, message: "Say what needs to change — the athlete gets these words." } as Fail;
  const r = await post<{ state: string }>(
    `/deliverables/${encodeURIComponent(id)}/${kind}`,
    kind === "revision" ? { reason: trimmed } : {},
    "The decision was not accepted",
  );
  if (r.ok) refresh();
  return r;
}

/** A short-lived signed link to one version of the content (audited by the API). */
export async function sponsorContentLink(id: string, version: number): Promise<{ ok: true; url: string } | Fail> {
  if (!valid(id) || !Number.isInteger(version) || version < 1) return { ok: false, message: "No such version." };
  let res: Response;
  try {
    res = await apiFetch(`/deliverables/${encodeURIComponent(id)}/assets/${version}/url`);
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `No link (HTTP ${res.status}).`) };
  return { ok: true, url: ((await res.json()) as { url: string }).url };
}

/** A short-lived signed link to the artwork file (audited by the API). */
export async function sponsorArtworkLink(id: string): Promise<{ ok: true; url: string } | Fail> {
  if (!valid(id)) return { ok: false, message: "No such file." };
  let res: Response;
  try {
    res = await apiFetch(`/edition-artwork/${encodeURIComponent(id)}/url`);
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `No link (HTTP ${res.status}).`) };
  return { ok: true, url: ((await res.json()) as { url: string }).url };
}
