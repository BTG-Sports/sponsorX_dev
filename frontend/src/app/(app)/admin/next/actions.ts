"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { editionBody, editionFormProblem, type EditionForm } from "@/lib/next-setup-live";
import { contentReadyNote, type ApiEditionState, type ApiSlotKind } from "@/lib/editions-live";
import { CONSENT_GRANTORS, type AssetKind, type GrantorKind, type SourceKind } from "@/lib/rights-live";
import type { EditionFileKind } from "@/lib/edition-files-live";

/* --------------------------------------------------------------------------
   P9-FE-03 / -04 — the NEXT inventory writes, as server actions.

   Booking sells a campaign every position its package promises, all or
   nothing (POST /editions/:id/sales, P9-BE-03). Adding a slot is the
   editorial meeting's act (POST /editions/:id/slots); Postgres refuses a
   second back cover or presenting position, and the message says so. The
   API's matrix and the ledger decide; these add no authority.
   -------------------------------------------------------------------------- */

export type EditionActionResult = { ok: true; message: string } | { ok: false; message: string };

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const unreachable = "The API is unreachable — try again in a minute.";

function refresh() {
  revalidatePath("/admin/next/editions");
  revalidatePath("/admin/next/inventory");
}

export async function bookCampaignAction(editionId: string, campaignId: string): Promise<EditionActionResult> {
  if (typeof editionId !== "string" || !editionId || typeof campaignId !== "string" || !campaignId) {
    return { ok: false, message: "Pick a campaign to book." };
  }
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/sales`, {
      method: "POST",
      body: JSON.stringify({ campaignId }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The booking did not go through (HTTP ${res.status}).`) };
    const { slots } = (await res.json()) as { slots: Array<{ slotCode: string }> };
    refresh();
    return { ok: true, message: `Booked ${slots.map((s) => s.slotCode).join(", ")}.` };
  } catch {
    return { ok: false, message: unreachable };
  }
}

const STATES: ApiEditionState[] = ["SELLING", "CLOSED", "IN_PRODUCTION", "PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED"];

/** Move an edition on. The API's state machine and production gate decide —
 *  an uncleared asset refuses production and publication with its title. */
export async function transitionEditionAction(editionId: string, to: ApiEditionState): Promise<EditionActionResult> {
  if (!editionId || !STATES.includes(to)) return { ok: false, message: "That move isn't offered here." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/transition`, {
      method: "POST",
      body: JSON.stringify({ to }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The edition did not move (HTTP ${res.status}).`) };
    refresh();
    revalidatePath("/admin/next/rights");
    revalidatePath("/admin/next/splits");
    return { ok: true, message: `Edition is now ${to.replace("_", " ").toLowerCase()}.` };
  } catch {
    return { ok: false, message: unreachable };
  }
}

export async function setContentReadyAction(editionId: string, contentReady: boolean): Promise<EditionActionResult> {
  if (!editionId || typeof contentReady !== "boolean") return { ok: false, message: "Nothing to change." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/conditions`, {
      method: "POST",
      body: JSON.stringify({ contentReady }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `Not saved (HTTP ${res.status}).`) };
    refresh();
    return { ok: true, message: contentReadyNote(contentReady).message };
  } catch {
    return { ok: false, message: unreachable };
  }
}

const ASSET_KINDS: AssetKind[] = ["ARTICLE", "PHOTO", "PHOTO_PACKAGE", "INTERVIEW", "VIDEO", "AD_CREATIVE", "DESIGN"];
const SOURCE_KINDS: SourceKind[] = ["STUDENT", "ATHLETE", "BTG", "THIRD_PARTY"];

/** P9-FE-13 — with `r2Key`, the piece's file: uploaded first on a grant from
 *  presignContentUploadAction, then checked by the API as the piece is saved
 *  (it arrived, and it is the type and size that were signed for). */
export async function addAssetAction(
  editionId: string,
  input: { kind: AssetKind; title: string; sourceKind: SourceKind; r2Key?: string | null; fileName?: string | null },
): Promise<EditionActionResult> {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!editionId || !title) return { ok: false, message: "Give the piece a title." };
  if (!ASSET_KINDS.includes(input.kind) || !SOURCE_KINDS.includes(input.sourceKind)) return { ok: false, message: "Pick a kind and a source." };
  const r2Key = typeof input.r2Key === "string" && input.r2Key ? input.r2Key : null;
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/assets`, {
      method: "POST",
      body: JSON.stringify({
        kind: input.kind, title, sourceKind: input.sourceKind,
        ...(r2Key ? { r2Key, fileName: fileNameOf(input.fileName) } : {}),
      }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The piece was not added (HTTP ${res.status}).`) };
    revalidatePath("/admin/next/rights");
    revalidatePath("/admin/next/production");
    refresh();
    return { ok: true, message: `“${title}” added${r2Key ? " with its file" : ""} — it needs a right before the edition can clear.` };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/* ── P9-FE-13 / -15 — files, straight to storage (P9-BE-25, -27) ─────────
   Each upload is three calls: a grant (the API answers the address and the
   Content-Type to send), the browser's own PUT to storage, then the save,
   where the API checks what arrived. These are the grant and the save; the
   bytes never pass through this server (lib/direct-upload.ts). */

export type UploadGrantResult = { ok: true; url: string; key: string; contentType: string } | { ok: false; message: string };

/** The name a file was chosen with, as the API takes it (≤ 255). */
function fileNameOf(name: unknown): string | null {
  return typeof name === "string" && name.trim() ? name.trim().slice(-255) : null;
}

async function grant(path: string, contentType: unknown, bytes: unknown, fallback: string): Promise<UploadGrantResult> {
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) return { ok: false, message: "That file is empty — choose another." };
  try {
    const res = await apiFetch(path, {
      method: "POST",
      body: JSON.stringify({ contentType: typeof contentType === "string" ? contentType.slice(0, 255) : "", bytes }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `${fallback} (HTTP ${res.status}).`) };
    const g = (await res.json()) as { url?: string; key?: string; contentType?: string };
    if (!g.url || !g.key || !g.contentType) return { ok: false, message: `${fallback}. Try again.` };
    return { ok: true, url: g.url, key: g.key, contentType: g.contentType };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** A grant to upload one file for this edition's content — any format, up to 2 GB. */
export async function presignContentUploadAction(editionId: string, contentType: string, bytes: number): Promise<UploadGrantResult> {
  if (typeof editionId !== "string" || !editionId) return { ok: false, message: "No edition." };
  return grant(`/editions/${encodeURIComponent(editionId)}/assets/uploads`, contentType, bytes, "The upload couldn't be started");
}

/** A file for a piece that was added by title. The API refuses ad artwork, a
 *  student's piece and a piece that already has its file, each with the reason. */
export async function attachAssetFileAction(assetId: string, r2Key: string, fileName: string | null): Promise<EditionActionResult> {
  if (typeof assetId !== "string" || !assetId || typeof r2Key !== "string" || !r2Key) return { ok: false, message: "Choose the file again." };
  try {
    const res = await apiFetch(`/edition-assets/${encodeURIComponent(assetId)}/file`, {
      method: "PUT",
      body: JSON.stringify({ r2Key, fileName: fileNameOf(fileName) }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The file was not saved (HTTP ${res.status}).`) };
    revalidatePath("/admin/next/rights");
    revalidatePath("/admin/next/production");
    return { ok: true, message: "File saved." };
  } catch {
    return { ok: false, message: unreachable };
  }
}

export type FileLinkResult = { ok: true; url: string; download: boolean } | { ok: false; message: string };

/** A short signed link to a piece's file. `download`: the browser must not
 *  open it in place (a design file, an HTML page), so it saves instead. */
export async function assetFileAction(assetId: string): Promise<FileLinkResult> {
  if (typeof assetId !== "string" || !assetId) return { ok: false, message: "No piece." };
  try {
    const res = await apiFetch(`/edition-assets/${encodeURIComponent(assetId)}/file`);
    if (!res.ok) return { ok: false, message: await reason(res, `The file couldn't be opened (HTTP ${res.status}).`) };
    const f = (await res.json()) as { url?: string; download?: boolean };
    if (!f.url) return { ok: false, message: "The file couldn't be opened. Try again." };
    return { ok: true, url: f.url, download: f.download === true };
  } catch {
    return { ok: false, message: unreachable };
  }
}

const EDITION_FILES: EditionFileKind[] = ["cover", "press-pdf"];

/** P9-FE-15 — a grant to upload the edition's cover (JPG, PNG or WebP, up to
 *  50 MB) or its press PDF (up to 2 GB). The API refuses anything else, in words. */
export async function presignEditionFileAction(editionId: string, which: EditionFileKind, contentType: string, bytes: number): Promise<UploadGrantResult> {
  if (typeof editionId !== "string" || !editionId || !EDITION_FILES.includes(which)) return { ok: false, message: "No edition." };
  return grant(`/editions/${encodeURIComponent(editionId)}/${which}/uploads`, contentType, bytes, "The upload couldn't be started");
}

/** Record the uploaded cover or press PDF; a new one replaces the one before it. */
export async function recordEditionFileAction(editionId: string, which: EditionFileKind, r2Key: string, fileName: string | null): Promise<EditionActionResult> {
  if (typeof editionId !== "string" || !editionId || !EDITION_FILES.includes(which) || typeof r2Key !== "string" || !r2Key) {
    return { ok: false, message: "Choose the file again." };
  }
  const what = which === "cover" ? "cover" : "press PDF";
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/${which}`, {
      method: "PUT",
      body: JSON.stringify({ r2Key, fileName: fileNameOf(fileName) }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The ${what} was not saved (HTTP ${res.status}).`) };
    const saved = (await res.json().catch(() => ({}))) as { replaced?: boolean };
    refresh();
    revalidatePath("/admin/next/production");
    return { ok: true, message: saved.replaced ? `The ${what} was replaced.` : `The ${what} is saved.` };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** BTG's signed, recorded read of the press PDF — always a download, by its name. */
export async function pressPdfAction(editionId: string): Promise<FileLinkResult> {
  if (typeof editionId !== "string" || !editionId) return { ok: false, message: "No edition." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/press-pdf`);
    if (!res.ok) return { ok: false, message: await reason(res, `The press PDF couldn't be opened (HTTP ${res.status}).`) };
    const f = (await res.json()) as { url?: string };
    if (!f.url) return { ok: false, message: "The press PDF couldn't be opened. Try again." };
    return { ok: true, url: f.url, download: true };
  } catch {
    return { ok: false, message: unreachable };
  }
}

const GRANTORS: GrantorKind[] = ["STUDENT", "ATHLETE", "GUARDIAN", "BTG", "THIRD_PARTY"];

export type GrantInput = {
  grantorKind: GrantorKind;
  grantorRef: string;
  evidence: string;
  mayPublishDigital: boolean;
  mayPublishPrint: boolean;
  mayPromote: boolean;
  mayReuseCommercially: boolean;
  /** yyyy-mm-dd */
  startsOn: string;
  endsOn?: string;
};

/** Record a right. Consent grantors carry the acceptance id, licence
 *  grantors the contract reference — the API refuses the wrong one. */
export async function grantRightAction(assetId: string, g: GrantInput): Promise<EditionActionResult> {
  if (!assetId || !g || !GRANTORS.includes(g.grantorKind)) return { ok: false, message: "Pick who is granting." };
  const ref = typeof g.grantorRef === "string" ? g.grantorRef.trim() : "";
  const evidence = typeof g.evidence === "string" ? g.evidence.trim() : "";
  if (!ref) return { ok: false, message: "Name the grantor." };
  if (!evidence) return { ok: false, message: CONSENT_GRANTORS.includes(g.grantorKind) ? "Give the signed acceptance's id." : "Give the licence reference." };
  const starts = new Date(`${g.startsOn}T00:00:00Z`);
  if (Number.isNaN(starts.getTime())) return { ok: false, message: "Pick a start date." };
  const ends = g.endsOn ? new Date(`${g.endsOn}T00:00:00Z`) : null;
  if (ends && Number.isNaN(ends.getTime())) return { ok: false, message: "That end date isn't valid." };
  const consent = CONSENT_GRANTORS.includes(g.grantorKind);
  try {
    const res = await apiFetch(`/edition-assets/${encodeURIComponent(assetId)}/rights`, {
      method: "POST",
      body: JSON.stringify({
        grantorKind: g.grantorKind,
        grantorRef: ref,
        mayPublishDigital: Boolean(g.mayPublishDigital),
        mayPublishPrint: Boolean(g.mayPublishPrint),
        mayPromote: Boolean(g.mayPromote),
        mayReuseCommercially: Boolean(g.mayReuseCommercially),
        startsAt: starts.toISOString(),
        endsAt: ends?.toISOString() ?? null,
        ...(consent ? { acceptanceId: evidence } : { licenseRef: evidence }),
      }),
    });
    if (!res.ok) {
      const why = await reason(res, `The right was not recorded (HTTP ${res.status}).`);
      /* The domain answers an acceptance it cannot find in this tenant as a
         refused agreement read — say what that means for the person typing. */
      if (consent && /read agreement/.test(why)) {
        return { ok: false, message: "No signed acceptance with that id — copy it from the consent record. The right was not recorded." };
      }
      return { ok: false, message: why };
    }
    revalidatePath("/admin/next/rights");
    refresh();
    return { ok: true, message: "Right recorded." };
  } catch {
    return { ok: false, message: unreachable };
  }
}

const KINDS: ApiSlotKind[] =["QUARTER", "HALF", "FULL", "BACK_COVER", "PRESENTING"];

/** Add a position. P9-BE-18 — an empty price takes the masthead's rate-card
 *  price; a typed price that differs from the card is refused by the API. */
export async function addSlotAction(
  editionId: string,
  input: { slotCode: string; kind: ApiSlotKind; priceDollars: string },
): Promise<EditionActionResult> {
  const code = typeof input?.slotCode === "string" ? input.slotCode.trim().toUpperCase() : "";
  if (!editionId || !code) return { ok: false, message: "Give the slot a code, e.g. P04-QTR-A." };
  if (!KINDS.includes(input.kind)) return { ok: false, message: "Pick a position kind." };
  const typed = typeof input.priceDollars === "string" ? input.priceDollars.trim() : "";
  const priceCents = typed ? Math.round(Number(typed) * 100) : null;
  if (priceCents !== null && (!Number.isFinite(priceCents) || priceCents < 0)) return { ok: false, message: "Rack price must be a dollar amount." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/slots`, {
      method: "POST",
      body: JSON.stringify({ slotCode: code, kind: input.kind, ...(priceCents !== null ? { priceCents } : {}) }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `The slot was not added (HTTP ${res.status}).`) };
    const slot = (await res.json()) as { priceCents?: number };
    refresh();
    return { ok: true, message: `${code} added${slot.priceCents != null ? ` at $${(slot.priceCents / 100).toLocaleString("en-US")}` : ""}.` };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/* ── P9-BE-17 / -19 — the sales-open date and the split lock ──────────── */

/** BTG sets (or clears) the day sales open by themselves — PLANNING only. */
export async function setSalesOpenAction(editionId: string, day: string): Promise<EditionActionResult> {
  if (!editionId) return { ok: false, message: "Nothing to change." };
  const at = day ? new Date(`${day}T00:00:00Z`) : null;
  if (at && Number.isNaN(at.getTime())) return { ok: false, message: "That date isn't valid." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/sales-open`, {
      method: "POST",
      body: JSON.stringify({ salesOpenAt: at?.toISOString() ?? null }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `Not saved (HTTP ${res.status}).`) };
    refresh();
    return { ok: true, message: at ? `Sales open by themselves on ${day}.` : "No date — BTG opens sales by hand." };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** BTG admin sets the masthead's rate card: dollars per kind; empty clears it. */
export async function setRateCardAction(publicationId: string, dollars: Partial<Record<ApiSlotKind, string>>): Promise<EditionActionResult> {
  if (!publicationId || !dollars) return { ok: false, message: "Nothing to change." };
  const prices: Partial<Record<ApiSlotKind, number | null>> = {};
  for (const k of KINDS) {
    if (!(k in dollars)) continue;
    const typed = (dollars[k] ?? "").trim();
    if (!typed) { prices[k] = null; continue; }
    const cents = Math.round(Number(typed) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return { ok: false, message: "Each price must be a dollar amount above zero." };
    prices[k] = cents;
  }
  try {
    const res = await apiFetch(`/publications/${encodeURIComponent(publicationId)}/rate-card`, {
      method: "PUT",
      body: JSON.stringify({ prices }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `Not saved (HTTP ${res.status}).`) };
    refresh();
    return { ok: true, message: "Rate card saved. New slots take these prices." };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** Finance locks the split with a note; BTG admin unlocks with a reason. */
export async function splitLockAction(editionId: string, lock: boolean, text: string): Promise<EditionActionResult> {
  const words = typeof text === "string" ? text.trim() : "";
  if (!editionId) return { ok: false, message: "Nothing to change." };
  if (!words) return { ok: false, message: lock ? "Say what you checked." : "Say why it is being unlocked." };
  if (words.length > 500) return { ok: false, message: "Keep it to 500 characters." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/splits/${lock ? "lock" : "unlock"}`, {
      method: "POST",
      body: JSON.stringify(lock ? { note: words } : { reason: words }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `Not saved (HTTP ${res.status}).`) };
    revalidatePath("/admin/next/splits");
    refresh();
    return { ok: true, message: lock ? "Split locked." : "Split unlocked." };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/* ── POL-FE-56 (app review B5) — BTG sets NEXT up ─────────────────────── */

async function send(path: string, method: "POST" | "PATCH", body: unknown, ok: string, fallback: string): Promise<EditionActionResult> {
  try {
    const res = await apiFetch(path, { method, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, message: await reason(res, `${fallback} (HTTP ${res.status}).`) };
    refresh();
    revalidatePath("/next/apply");
    return { ok: true, message: ok };
  } catch {
    return { ok: false, message: unreachable };
  }
}

export async function createPublicationAction(name: string, propertyId: string | null): Promise<EditionActionResult> {
  const n = typeof name === "string" ? name.trim().slice(0, 200) : "";
  if (!n) return { ok: false, message: "Name the publication, e.g. \"The Northside Record\"." };
  return send("/publications", "POST", { name: n, propertyId: propertyId || null }, `Publication "${n}" created. Its school now appears on the student application.`, "The publication wasn't created");
}

export async function createEditionAction(publicationId: string, form: EditionForm): Promise<EditionActionResult> {
  if (typeof publicationId !== "string" || !publicationId) return { ok: false, message: "Pick the publication." };
  const problem = editionFormProblem(form);
  if (problem) return { ok: false, message: problem };
  return send(`/publications/${encodeURIComponent(publicationId)}/editions`, "POST", editionBody(form), `Edition "${form.label.trim()}" created — it's planning; open sales when the page plan is ready.`, "The edition wasn't created");
}

export async function updateEditionAction(editionId: string, form: EditionForm): Promise<EditionActionResult> {
  if (typeof editionId !== "string" || !editionId) return { ok: false, message: "No edition." };
  const problem = editionFormProblem(form);
  if (problem) return { ok: false, message: problem };
  const b = editionBody(form);
  return send(`/editions/${encodeURIComponent(editionId)}`, "PATCH", { ...b, salesOpenAt: form.salesOpenAt ? b.salesOpenAt : null }, "Edition updated.", "The edition wasn't changed");
}

export async function cancelEditionAction(editionId: string): Promise<EditionActionResult> {
  if (typeof editionId !== "string" || !editionId) return { ok: false, message: "No edition." };
  return send(`/editions/${encodeURIComponent(editionId)}/transition`, "POST", { to: "CANCELLED" }, "Edition cancelled.", "The edition wasn't cancelled");
}
