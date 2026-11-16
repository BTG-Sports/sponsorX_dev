"use server";

/* --------------------------------------------------------------------------
   Submit a brief — P4-FE-01, §13 step 2, §17.

   The marketplace drawer's "Submit brief to BTG". A Server Function is
   reachable by a direct POST, not only from our UI, so it re-establishes who
   is asking every time (fetchActor → GET /me) and files the brief against
   THAT user's sponsor — never one the caller names. The API then applies the
   matrix again (campaignBrief.write, sponsor scope), so this is identity and
   plumbing, not the authorisation.

   A request, not a purchase. P4-FE-09 (P4-BE-11): when every safety check
   passes, the API approves it on the spot and its campaign is staffed;
   otherwise it waits in DRAFT for BTG. The answer carries which, in the
   sponsor-safe words the drawer shows.
   -------------------------------------------------------------------------- */

import { revalidatePath } from "next/cache";

import { apiFetch, fetchActor } from "@/server/api";
import { BriefRequestInvalid, stateCodesFor, toBriefBody, type BriefRequest } from "@/lib/brief-request";
import { requestStatus, type BriefStatus, type WaitingOn } from "@/lib/brief-status";

/** P4-FE-09 — `status`: approved automatically, or BTG is reviewing it (the
 *  API's sponsor-safe line; never why a request waits). POL-FE-51 —
 *  `waitingOn`: ATHLETES when it is held only because too few athletes fit. */
export type BriefResult = { ok: true; id: string; status?: BriefStatus; waitingOn?: WaitingOn } | { ok: false; error: string };

export async function submitBrief(input: Omit<BriefRequest, "sponsorId">): Promise<BriefResult> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.sponsorId) {
    return { ok: false, error: "Sign in with your sponsor account to send a brief." };
  }

  let body;
  try {
    body = toBriefBody({ ...input, sponsorId: who.actor.sponsorId });
  } catch (e) {
    if (e instanceof BriefRequestInvalid) return { ok: false, error: e.message };
    throw e;
  }

  const res = await apiFetch("/briefs", { method: "POST", body: JSON.stringify(body) });
  if (res.status === 201) {
    const out = (await res.json()) as { id: string; state: string; status?: BriefStatus; waitingOn?: WaitingOn };
    /* An approved request is already a campaign — the Campaigns page shows it. */
    revalidatePath("/sponsor/campaigns");
    return { ok: true, id: out.id, status: requestStatus(out), waitingOn: out.waitingOn ?? null };
  }
  if (res.status === 403) return { ok: false, error: "This account can't file briefs for this sponsor." };
  if (res.status === 400) return { ok: false, error: "Some details weren't accepted — check the dates and budget." };
  /* POL-FE-58 — e.g. a student code that isn't valid: the API's own words. */
  if (res.status === 422) {
    const said = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    return { ok: false, error: said || "Some details weren't accepted — check the request and try again." };
  }
  return { ok: false, error: "BTG couldn't receive the brief just now — please try again." };
}

/**
 * POL-FE-51 — can BTG staff this package for the sport and area the
 * sponsor picked in the drawer? GET /catalogue/staffing answers a yes / no
 * per package for the caller's own tenant and sponsor; this picks the one
 * asked about. null — no answer to show — for a package no athlete staffs,
 * a signed-out caller, or any failure: the drawer then just says nothing.
 */
export async function checkStaffing(input: { packageId: string; sport: string; geo: string }): Promise<boolean | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  const q = new URLSearchParams();
  if (input.sport) q.set("sport", input.sport);
  const states = stateCodesFor(input.geo ?? "");
  if (states.length) q.set("state", states.join(","));
  const qs = q.toString();
  const res = await apiFetch(`/catalogue/staffing${qs ? `?${qs}` : ""}`).catch(() => null);
  if (!res?.ok) return null;
  const { packages } = (await res.json()) as { packages: { id: string; staffable: boolean | null }[] };
  return packages.find((p) => p.id === input.packageId)?.staffable ?? null;
}
