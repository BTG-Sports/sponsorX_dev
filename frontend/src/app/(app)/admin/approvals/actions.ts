"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import type { BoardMove } from "@/lib/edition-artwork-live";
import type {
  ApprovalActionKind,
  ApprovalResult,
  AssetLinkResult,
} from "@/lib/approvals-live";

/* --------------------------------------------------------------------------
   P5-FE-04 — the content desk's decisions, as server actions.

   The P3-FE-02 precedent: apiFetch forwards the reviewer's own token; the
   API's matrix and §21 state machine decide (deliverable-state.ts), audit
   and notify the athlete in the same transaction. The action whitelists the
   five moves and returns refusals as values for the drawer.
   -------------------------------------------------------------------------- */

const PATH: Record<ApprovalActionKind, string> = {
  "btg-review": "btg-review",
  "sponsor-review": "sponsor-review",
  approve: "approve",
  revision: "revision",
  verify: "verify",
};

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function approvalAction(
  id: string,
  kind: ApprovalActionKind,
  note?: string,
): Promise<ApprovalResult> {
  const path = PATH[kind];
  if (!path || typeof id !== "string" || !id) return { ok: false, message: "Unknown decision." };
  const trimmed = note?.trim() ?? "";
  if (kind === "revision" && !trimmed) {
    return { ok: false, message: "Say what needs to change — the athlete gets these words." };
  }
  let res: Response;
  try {
    res = await apiFetch(`/deliverables/${encodeURIComponent(id)}/${path}`, {
      method: "POST",
      body: JSON.stringify(kind === "revision" ? { reason: trimmed } : {}),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was decided. Try again in a minute." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `The decision was not accepted (HTTP ${res.status}).`) };
  const d = (await res.json()) as { state: string };
  return { ok: true, state: d.state };
}

/** A short-lived signed link to one creative version (audited by the API). */
export async function assetLink(id: string, version: number): Promise<AssetLinkResult> {
  if (typeof id !== "string" || !id || !Number.isInteger(version) || version < 1) {
    return { ok: false, message: "No such version." };
  }
  let res: Response;
  try {
    res = await apiFetch(`/deliverables/${encodeURIComponent(id)}/assets/${version}/url`);
  } catch {
    return { ok: false, message: "The API is unreachable." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `No link (HTTP ${res.status}).`) };
  return { ok: true, url: ((await res.json()) as { url: string }).url };
}

/* --------------------------------------------------------------------------
   P9-BE-16 — edition ad artwork, the board's second kind of subject. BTG's
   three moves only: there is no approve here — the sign-off is the buying
   sponsor's, on their campaign page, and the API refuses it from staff.
   -------------------------------------------------------------------------- */

const ARTWORK_PATH: Record<BoardMove, string> = {
  "btg-review": "btg-review",
  "sponsor-review": "sponsor-review",
  revision: "revision",
};

export async function artworkAction(id: string, kind: BoardMove, note?: string): Promise<ApprovalResult> {
  const path = ARTWORK_PATH[kind];
  if (!path || typeof id !== "string" || !id) return { ok: false, message: "Unknown decision." };
  const trimmed = note?.trim() ?? "";
  if (kind === "revision" && !trimmed) return { ok: false, message: "Say what needs to change — the sponsor gets these words." };
  let res: Response;
  try {
    res = await apiFetch(`/edition-artwork/${encodeURIComponent(id)}/${path}`, {
      method: "POST",
      body: JSON.stringify(kind === "revision" ? { reason: trimmed } : {}),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was decided. Try again in a minute." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `The decision was not accepted (HTTP ${res.status}).`) };
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/next/editions");
  return { ok: true, state: ((await res.json()) as { state: string }).state };
}

/** A short-lived signed link to the artwork file (audited by the API). */
export async function artworkLink(id: string): Promise<AssetLinkResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "No such file." };
  let res: Response;
  try {
    res = await apiFetch(`/edition-artwork/${encodeURIComponent(id)}/url`);
  } catch {
    return { ok: false, message: "The API is unreachable." };
  }
  if (!res.ok) return { ok: false, message: await reason(res, `No link (HTTP ${res.status}).`) };
  return { ok: true, url: ((await res.json()) as { url: string }).url };
}

/* POL-FE-62 (app review §2) — BTG records a day's figures (VERIFIED_MANUAL) and makes a tracking link for a post. */
export async function recordViewsAction(id: string, day: string, views: number, engagements: number): Promise<{ ok: boolean; message: string }> {
  if (typeof id !== "string" || !id || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(views) || views < 0 || !Number.isInteger(engagements) || engagements < 0) {
    return { ok: false, message: "Check the day and the numbers." };
  }
  try {
    const res = await apiFetch(`/deliverables/${encodeURIComponent(id)}/metrics`, { method: "POST", body: JSON.stringify({ day, views, engagements, source: "VERIFIED_MANUAL" }) });
    if (!res.ok) {
      const said = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
      return { ok: false, message: said ?? `The figures weren't saved (HTTP ${res.status}).` };
    }
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/campaigns");
    return { ok: true, message: `Recorded ${views.toLocaleString("en-US")} views for ${day}. The report counts them as checked by BTG.` };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}

export async function createTrackingLinkAction(id: string, destinationUrl: string): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  if (typeof id !== "string" || !id) return { ok: false, message: "No deliverable." };
  try {
    const res = await apiFetch(`/deliverables/${encodeURIComponent(id)}/tracking-link`, { method: "POST", body: JSON.stringify({ destinationUrl: destinationUrl.trim() }) });
    const body = (await res.json().catch(() => null)) as { code?: string; error?: { message?: string } } | null;
    if (!res.ok || !body?.code) return { ok: false, message: body?.error?.message ?? `The link wasn't made (HTTP ${res.status}).` };
    return { ok: true, code: body.code };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
