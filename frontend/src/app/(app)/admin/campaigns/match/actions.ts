"use server";

import { apiFetch } from "@/server/api";
import type { SendOutcome } from "@/components/matching-studio";

/* --------------------------------------------------------------------------
   P4-FE-03 — sending the roster's invitations, as a server action.

   Two API calls the desk used to make by hand: an APPROVED brief becomes its
   campaign (POST /briefs/{id}/campaign) the first time anyone sends, then
   each pick gets one invitation per package line (POST
   /campaigns/{id}/invitations). The API owns every rule that matters here —
   the §26 conflict re-check at the moment of inviting, §37's guardian gate,
   the one-open-invite index — so a stale tab that shortlisted wrongly is
   still refused. This adds no authority: apiFetch forwards the manager's own
   token, and refusals come back as values, per athlete.
   -------------------------------------------------------------------------- */

export type SendPick = {
  athleteId: string;
  lines: { jobId: string; offered: number }[];
};

type ApiError = { error?: { message?: string; issues?: Array<{ message: string }> } };

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as ApiError;
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function sendInvitations(
  briefId: string,
  picks: SendPick[],
): Promise<SendOutcome[]> {
  const fail = (message: string) =>
    picks.map((p) => ({ athleteId: p.athleteId, ok: false, message }));

  if (typeof briefId !== "string" || !briefId || !Array.isArray(picks) || picks.length === 0) {
    return fail("Nothing to send.");
  }

  let campaignId: string;
  try {
    const briefRes = await apiFetch(`/briefs/${encodeURIComponent(briefId)}`);
    if (!briefRes.ok) return fail(await reason(briefRes, `The brief could not be read (HTTP ${briefRes.status}).`));
    const brief = (await briefRes.json()) as {
      objective: string;
      sponsorName: string;
      campaign: { id: string } | null;
    };

    if (brief.campaign) {
      campaignId = brief.campaign.id;
    } else {
      /* First send on this brief: it becomes its campaign. The API refuses
         anything not APPROVED, so this can't skip BTG's approval. */
      const name = `${brief.sponsorName} — ${brief.objective}`.slice(0, 160);
      const made = await apiFetch(`/briefs/${encodeURIComponent(briefId)}/campaign`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!made.ok) return fail(await reason(made, `The campaign could not be created (HTTP ${made.status}).`));
      campaignId = ((await made.json()) as { id: string }).id;
    }
  } catch {
    return fail("The API is unreachable — nothing was sent. Try again in a minute.");
  }

  const out: SendOutcome[] = [];
  for (const p of picks) {
    if (!Array.isArray(p.lines) || p.lines.length === 0) {
      out.push({ athleteId: p.athleteId, ok: false, message: "No priced line to offer." });
      continue;
    }
    let failure: string | null = null;
    for (const line of p.lines) {
      try {
        const res = await apiFetch(`/campaigns/${encodeURIComponent(campaignId)}/invitations`, {
          method: "POST",
          body: JSON.stringify({ athleteId: p.athleteId, jobId: line.jobId, offered: line.offered }),
        });
        if (!res.ok) {
          failure = `${line.jobId}: ${await reason(res, `refused (HTTP ${res.status})`)}`;
          break;
        }
      } catch {
        failure = "The API became unreachable mid-send — reload to see what landed.";
        break;
      }
    }
    out.push(failure ? { athleteId: p.athleteId, ok: false, message: failure } : { athleteId: p.athleteId, ok: true });
  }
  return out;
}
