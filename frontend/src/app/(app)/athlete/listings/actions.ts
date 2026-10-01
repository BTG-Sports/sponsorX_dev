"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { apiErrorMessage } from "@/lib/property-p2-live";
import { validateDescription, type ApiAthleteListing } from "@/lib/athlete-listings-live";

/* --------------------------------------------------------------------------
   2S3-FE-02 — "List my item"'s writes, as server actions (2S3-BE-05):

     POST  /listings                  create, DRAFT (ListingInput). 409 for a
                                      roster athlete ("You're on a team — …")
                                      or one BTG hasn't approved
     POST  /listings/:id/submit       DRAFT → PENDING_APPROVAL; 422 with
                                      error.problems[] while governance fails
     PATCH /listings/:id              what the sponsor gets — DRAFT / PAUSED
     POST  /listings/:id/transition   PAUSED · PUBLISHED (resume) · ARCHIVED

   The design's one "Submit" is two calls: create the draft, then submit
   it. If the submit is refused the draft is kept and named, so nothing the
   athlete wrote is lost. The API's matrix (listing write "own": only what
   they sell themselves) decides; these add no authority.
   -------------------------------------------------------------------------- */

export type AthleteListingResult =
  | { ok: true; listing: ApiAthleteListing }
  | { ok: false; message: string; problems: string[]; draftId?: string };

const UNREACHABLE = "The API is unreachable — nothing changed. Try again in a minute.";

async function call(path: string, method: string, body: unknown, fallback: string): Promise<AthleteListingResult> {
  let res: Response;
  try {
    res = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    return { ok: false, message: UNREACHABLE, problems: [] };
  }
  if (res.ok) return { ok: true, listing: (await res.json()) as ApiAthleteListing };
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (res.status === 403) return { ok: false, message: "Only you can list your own items — and only the ones you sell yourself.", problems: [] };
  const e = apiErrorMessage(parsed, res.status, fallback);
  return { ok: false, message: e.message, problems: e.problems };
}

function refresh(id?: string) {
  revalidatePath("/athlete/listings");
  if (id) revalidatePath(`/athlete/listings/${id}`);
}

/** Compose → Submit: create the draft, then submit it for BTG's check. */
export async function listItemAction(inventoryItemId: string, title: string, description: string): Promise<AthleteListingResult> {
  if (typeof inventoryItemId !== "string" || !inventoryItemId) return { ok: false, message: "Choose an item to list.", problems: [] };
  if (typeof title !== "string" || !title.trim()) return { ok: false, message: "The item needs a title — give it one in Inventory.", problems: [] };
  const d = validateDescription(typeof description === "string" ? description : "");
  if (!d.ok) return { ok: false, message: d.message, problems: [] };
  const created = await call("/listings", "POST", { inventoryItemId, title: title.trim().slice(0, 200), description: d.value || null, visibility: "PUBLIC" }, "The listing was not created");
  if (!created.ok) return created;
  const id = created.listing.id;
  const submitted = await call(`/listings/${encodeURIComponent(id)}/submit`, "POST", undefined, "The listing was not submitted");
  refresh(id);
  return submitted.ok ? submitted : { ...submitted, draftId: id };
}

/** Save what the sponsor gets (DRAFT or PAUSED). */
export async function saveListingDescriptionAction(id: string, description: string): Promise<AthleteListingResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown listing.", problems: [] };
  const d = validateDescription(typeof description === "string" ? description : "");
  if (!d.ok) return { ok: false, message: d.message, problems: [] };
  const r = await call(`/listings/${encodeURIComponent(id)}`, "PATCH", { description: d.value || null }, "The listing was not saved");
  refresh(id);
  return r;
}

/** Submit a draft — saving its edits first when there are any. */
export async function submitAthleteListingAction(id: string, description: string | null): Promise<AthleteListingResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown listing.", problems: [] };
  if (description !== null) {
    const saved = await saveListingDescriptionAction(id, description);
    if (!saved.ok) return saved;
  }
  const r = await call(`/listings/${encodeURIComponent(id)}/submit`, "POST", undefined, "The listing was not submitted");
  refresh(id);
  return r;
}

const MOVES = ["PAUSED", "PUBLISHED", "ARCHIVED"] as const;

/** Pause, resume (re-checks governance, after saving edits) or end. */
export async function moveAthleteListingAction(id: string, to: (typeof MOVES)[number], description: string | null): Promise<AthleteListingResult> {
  if (typeof id !== "string" || !id || !MOVES.includes(to)) return { ok: false, message: "Unknown listing action.", problems: [] };
  if (description !== null && to === "PUBLISHED") {
    const saved = await saveListingDescriptionAction(id, description);
    if (!saved.ok) return saved;
  }
  const r = await call(`/listings/${encodeURIComponent(id)}/transition`, "POST", { to }, "The listing did not move");
  refresh(id);
  return r;
}
