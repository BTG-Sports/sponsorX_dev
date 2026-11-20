"use server";

/* --------------------------------------------------------------------------
   Create a campaign — POL-FE-107 and POL-FE-116 (polish.md §107, §116).

   The builder's two calls. A Server Function is reachable by a direct POST,
   not only from our page, so each one re-establishes who is asking
   (fetchActor → GET /me) and files the campaign against THAT user's sponsor,
   never one the caller names. The API then applies the matrix again
   (campaignBrief.write, sponsor scope) and checks every field of the order
   details itself; this is identity and plumbing, not the authorisation.

     createCampaign   POST /briefs with NO package, the country, and the
                      order details and code the builder set. The API
                      approves it on the spot or holds it for BTG, as it does
                      a package request; the answer says which, in the
                      sponsor-safe words.
     orderCodeFor     GET /campaign-builder/order-code?name= — the three
                      letters the API would make from a campaign's name.

   The request is built here, on the server, from the draft: the catalogue
   and the countries are read again rather than trusted from the browser.

   Only async functions are exported from this file (a constant exported from
   a "use server" file breaks every action in it at run time).
   -------------------------------------------------------------------------- */

import { revalidatePath } from "next/cache";

import { requestStatus, type BriefStatus, type WaitingOn } from "@/lib/brief-status";
import { ORDER_CODE, buildCampaign, isCatalogue, type BuilderDraft } from "@/lib/campaign-builder";
import { apiFetch, fetchActor } from "@/server/api";

export type CreateCampaignResult =
  | { ok: true; id: string; status: BriefStatus; waitingOn: WaitingOn; campaignId: string | null }
  | { ok: false; error: string; step?: number; problems?: Record<string, string> };

const said = async (res: Response): Promise<string | null> => {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const m = body?.error?.message;
  return typeof m === "string" && m.trim() ? m.trim() : null;
};

export async function createCampaign(draft: BuilderDraft): Promise<CreateCampaignResult> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.sponsorId) {
    return { ok: false, error: "Sign in with your sponsor account to create a campaign." };
  }
  if (!who.actor.roles.includes("SPONSOR_ADMIN")) {
    return { ok: false, error: "Only a sponsor admin on your team can create a campaign." };
  }

  const [cat, targeting] = await Promise.all([apiFetch("/campaign-builder/catalogue").catch(() => null), apiFetch("/catalogue/targeting").catch(() => null)]);
  const catalogue = cat?.ok ? ((await cat.json().catch(() => null)) as unknown) : null;
  if (!isCatalogue(catalogue)) return { ok: false, error: "SponsorX couldn't check the campaign just now, so nothing was sent. Try again in a minute." };
  const t = targeting?.ok ? ((await targeting.json().catch(() => null)) as { countryCodes?: unknown } | null) : null;
  /* With no list of countries to check against, the API's own check is the one that counts. */
  const countries = Array.isArray(t?.countryCodes) ? (t.countryCodes as unknown[]).filter((c): c is string => typeof c === "string") : [draft.country];

  const built = buildCampaign(draft, who.actor.sponsorId, { catalogue, countries });
  if (!built.ok) return { ok: false, error: "Something on this step still needs a look.", step: built.step, problems: built.problems };

  const res = await apiFetch("/briefs", { method: "POST", body: JSON.stringify(built.body) });
  if (res.status === 201) {
    const out = (await res.json()) as { id: string; state: string; status?: BriefStatus; waitingOn?: WaitingOn; campaignId?: string | null };
    /* It shows under Requests at once; an approved one is already a campaign. */
    revalidatePath("/sponsor/requests");
    revalidatePath("/sponsor/campaigns");
    revalidatePath("/sponsor");
    return { ok: true, id: out.id, status: requestStatus(out), waitingOn: out.waitingOn ?? null, campaignId: out.campaignId ?? null };
  }
  if (res.status === 403) return { ok: false, error: "This account can't create a campaign for this sponsor." };
  /* 400: states outside the United States, or an unknown country. 409 and 422:
     an order detail the API refused, in its own words. */
  if (res.status === 400 || res.status === 409 || res.status === 422) {
    return { ok: false, error: (await said(res)) ?? "Some details weren't accepted. Check the campaign and try again." };
  }
  return { ok: false, error: "BTG couldn't receive the campaign just now, and nothing was sent. Your answers are still here. Try again." };
}

/** The API's three letters for a campaign's name; null when it can't be asked (the page keeps its own). */
export async function orderCodeFor(name: string): Promise<string | null> {
  const n = name.trim().slice(0, 160);
  if (!n) return null;
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.sponsorId) return null;
  const res = await apiFetch(`/campaign-builder/order-code?name=${encodeURIComponent(n)}`).catch(() => null);
  if (!res?.ok) return null;
  const out = (await res.json().catch(() => null)) as { orderCode?: unknown } | null;
  return typeof out?.orderCode === "string" && ORDER_CODE.test(out.orderCode) ? out.orderCode : null;
}
