"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { apiErrorMessage, validateListingDraft, type ApiListing, type ListingDraft } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S3-FE-01 — the listing editor's writes, as server actions.

     POST  /listings                   create (ListingInput) — 409 when the
                                       property isn't approved to list, or the
                                       item already has a live listing
     PATCH /listings/:id               wording, visibility, schedule (DRAFT /
                                       PAUSED / held — a held one goes back to
                                       DRAFT; 409 otherwise)
     POST  /listings/:id/submit        DRAFT → PUBLISHED when the checks pass,
                                       else PENDING_APPROVAL (held for BTG,
                                       with `hold`); 422 with error.problems[]
                                       while governance fails (2S3-BE-06)
     POST  /listings/:id/transition    { to: PAUSED | PUBLISHED | ARCHIVED }
                                       (PUBLISHED = resume, the submit's path)

   The API's matrix (listing: PROPERTY_MGR own property) and state machine
   decide; these add no authority and pass refusals through in its words.
   -------------------------------------------------------------------------- */

export type ListingResult =
  | { ok: true; listing: ApiListing }
  | { ok: false; message: string; problems: string[] };

const unreachable = "The API is unreachable — nothing changed. Try again in a minute.";

async function call(path: string, method: string, body: unknown, fallback: string): Promise<ListingResult> {
  let res: Response;
  try {
    res = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    return { ok: false, message: unreachable, problems: [] };
  }
  if (res.ok) return { ok: true, listing: (await res.json()) as ApiListing };
  if (res.status === 403) return { ok: false, message: "Only your property's manager can change its listings.", problems: [] };
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  const e = apiErrorMessage(parsed, res.status, fallback);
  return { ok: false, message: e.message, problems: e.problems };
}

function refresh(id?: string) {
  revalidatePath("/property/listings");
  if (id) revalidatePath(`/property/listings/${id}`);
}

export async function createListingAction(inventoryItemId: string, draft: ListingDraft): Promise<ListingResult> {
  if (typeof inventoryItemId !== "string" || !inventoryItemId) return { ok: false, message: "Choose an item to list.", problems: [] };
  const v = validateListingDraft(draft);
  if (!v.ok) return { ok: false, message: v.message, problems: [] };
  const r = await call("/listings", "POST", { inventoryItemId, ...v.body }, "The listing was not created");
  if (r.ok) refresh(r.listing.id);
  return r;
}

export async function saveListingAction(id: string, draft: ListingDraft): Promise<ListingResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown listing.", problems: [] };
  const v = validateListingDraft(draft);
  if (!v.ok) return { ok: false, message: v.message, problems: [] };
  const r = await call(`/listings/${encodeURIComponent(id)}`, "PATCH", v.body, "The listing was not saved");
  refresh(id);
  return r;
}

/** Submit — live when the checks pass, else held for BTG — saving the draft first when it has unsaved edits. */
export async function submitListingAction(id: string, draft: ListingDraft | null): Promise<ListingResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown listing.", problems: [] };
  if (draft) {
    const saved = await saveListingAction(id, draft);
    if (!saved.ok) return saved;
  }
  const r = await call(`/listings/${encodeURIComponent(id)}/submit`, "POST", undefined, "The listing was not submitted");
  refresh(id);
  return r;
}

const MOVES = ["PAUSED", "PUBLISHED", "ARCHIVED"] as const;

export async function moveListingAction(id: string, to: (typeof MOVES)[number], draft: ListingDraft | null): Promise<ListingResult> {
  if (typeof id !== "string" || !id || !MOVES.includes(to)) return { ok: false, message: "Unknown listing action.", problems: [] };
  /* Resuming a paused listing with edits: save them, then resume — the
     governance re-check runs on what was saved. */
  if (draft && to === "PUBLISHED") {
    const saved = await saveListingAction(id, draft);
    if (!saved.ok) return saved;
  }
  const r = await call(`/listings/${encodeURIComponent(id)}/transition`, "POST", { to }, "The listing did not move");
  refresh(id);
  return r;
}
