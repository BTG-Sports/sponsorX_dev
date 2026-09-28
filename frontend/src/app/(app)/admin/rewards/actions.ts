"use server";

import { apiFetch } from "@/server/api";
import type {
  ApiRewardDetail,
  ApiRewardState,
  CreateRewardResult,
  LinkResult,
  NewReward,
  SimpleResult,
} from "@/lib/rewards-live";

/* --------------------------------------------------------------------------
   P6-FE-01 — the reward desk's writes, as server actions.

   Creating a reward is three API calls the desk makes in order: the reward
   (DRAFT, POST /campaigns/{id}/rewards — with its eligibility, redemption
   cap and landing copy since P6-BE-08), one token per athlete (each queues
   its QR PNG on the worker, P6-BE-06), and — if asked — the move to ACTIVE.
   A failure part-way returns the reward id, and the creator sends it back
   on the retry (`resumeRewardId`) so the retry finishes that reward instead
   of creating a second one. The API's matrix and state machine decide;
   these add no authority.
   -------------------------------------------------------------------------- */

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const unreachable = "The API is unreachable — try again in a minute.";

export async function createRewardAction(input: NewReward): Promise<CreateRewardResult> {
  if (!input?.campaignId || !input.offerText?.trim() || !input.terms?.trim()) {
    return { ok: false, message: "Name the offer and its terms." };
  }
  let rewardId: string | undefined = input.resumeRewardId || undefined;
  try {
    /* A RETRY after a part-way failure finishes the reward already saved:
       it issues only the tokens that athlete doesn't have yet and makes it
       live if asked, rather than creating a second reward (QA pass 5). */
    let already = new Set<string>();
    let alreadyLive = false;
    /* The offer as SAVED. A retry does not edit the reward (there is no edit
       route): the creator locks its fields once one exists, and the result
       names what was actually saved (QA pass 6, P6-FE-03). */
    let offerText = input.offerText.trim();
    if (rewardId) {
      const got = await apiFetch(`/rewards/${encodeURIComponent(rewardId)}`);
      if (!got.ok) return { ok: false, rewardId, message: await reason(got, `The saved reward couldn't be read (HTTP ${got.status}).`) };
      const saved = (await got.json()) as ApiRewardDetail;
      already = new Set(saved.tokens.map((t) => t.athlete?.id).filter((id): id is string => Boolean(id)));
      alreadyLive = saved.state === "ACTIVE";
      if (saved.offerText) offerText = saved.offerText;
    } else {
      const made = await apiFetch(`/campaigns/${encodeURIComponent(input.campaignId)}/rewards`, {
        method: "POST",
        body: JSON.stringify({
          offerText: input.offerText.trim(),
          terms: input.terms.trim(),
          expiresAt: input.expiresAt,
          singleUse: input.singleUse,
          /* P6-BE-08 — the API stores blank copy as null and enforces the cap. */
          eligibility: input.eligibility,
          eligibilityNote: input.eligibilityNote,
          redemptionCap: input.redemptionCap,
          /* QA-09 — how long a claim holds a unit of a capped reward. */
          reserveMinutes: input.reserveMinutes,
          landingHeadline: input.landingHeadline,
          landingSubhead: input.landingSubhead,
        }),
      });
      if (!made.ok) return { ok: false, message: await reason(made, `The reward was not created (HTTP ${made.status}).`) };
      rewardId = ((await made.json()) as { id: string }).id;
    }

    let tokens = already.size;
    for (const athleteId of input.athleteIds) {
      if (already.has(athleteId)) continue;
      const t = await apiFetch(`/rewards/${encodeURIComponent(rewardId)}/tokens`, {
        method: "POST",
        body: JSON.stringify({ athleteId }),
      });
      if (!t.ok) {
        return { ok: false, rewardId, message: `Created, but a token failed: ${await reason(t, `HTTP ${t.status}`)}` };
      }
      tokens += 1;
    }

    if (input.activate && !alreadyLive) {
      const live = await apiFetch(`/rewards/${encodeURIComponent(rewardId)}/transition`, {
        method: "POST",
        body: JSON.stringify({ to: "ACTIVE" }),
      });
      if (!live.ok) {
        return { ok: false, rewardId, message: `Created as a draft, but not made live: ${await reason(live, `HTTP ${live.status}`)}` };
      }
    }
    return { ok: true, rewardId, tokens, activated: input.activate || alreadyLive, offerText };
  } catch {
    return { ok: false, message: unreachable, ...(rewardId ? { rewardId } : {}) };
  }
}

export async function moveRewardAction(id: string, to: ApiRewardState): Promise<SimpleResult> {
  if (!id) return { ok: false, message: "No reward." };
  try {
    const res = await apiFetch(`/rewards/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      body: JSON.stringify({ to }),
    });
    return res.ok ? { ok: true } : { ok: false, message: await reason(res, `Not moved (HTTP ${res.status}).`) };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** One reward with its tokens — loaded when the desk opens its QR panel. */
export async function rewardDetailAction(id: string): Promise<{ ok: true; reward: ApiRewardDetail } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(`/rewards/${encodeURIComponent(id)}`);
    if (!res.ok) return { ok: false, message: await reason(res, `Unavailable (HTTP ${res.status}).`) };
    return { ok: true, reward: (await res.json()) as ApiRewardDetail };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** A signed, audited link to one token's QR PNG, for printing. */
export async function qrLinkAction(tokenId: string): Promise<LinkResult> {
  try {
    const res = await apiFetch(`/reward-tokens/${encodeURIComponent(tokenId)}/qr-url`);
    if (!res.ok) return { ok: false, message: res.status === 403 ? "The QR is still being generated — try again shortly." : await reason(res, `HTTP ${res.status}`) };
    return { ok: true, url: ((await res.json()) as { url: string }).url };
  } catch {
    return { ok: false, message: unreachable };
  }
}

/** The athletes signed onto a campaign — who can carry a token. */
export async function campaignAthletesAction(
  campaignId: string,
): Promise<{ ok: true; athletes: { id: string; name: string }[] } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(`/campaigns/${encodeURIComponent(campaignId)}/ops`);
    if (!res.ok) return { ok: false, message: await reason(res, `Roster unavailable (HTTP ${res.status}).`) };
    const { roster } = (await res.json()) as {
      roster: { athleteId: string; name: string; order: { state: string } | null }[];
    };
    const signed = new Set(["ACCEPTED", "ACTIVE", "COMPLETED"]);
    return {
      ok: true,
      athletes: roster.filter((r) => r.order && signed.has(r.order.state)).map((r) => ({ id: r.athleteId, name: r.name })),
    };
  } catch {
    return { ok: false, message: unreachable };
  }
}
