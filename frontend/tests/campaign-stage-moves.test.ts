import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { stageMovedLine, stageMoveRefusal, stageMoves } from "@/lib/campaign-stage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/* POL-FE-52 (app review B1) — a partly staffed campaign never reached
   APPROVAL. Done when: BTG moves a campaign DRAFT → STAFFING → APPROVAL (and
   back) from the campaign page, then launches it; a refused move shows the
   API's reason. (The legal moves are the API's — campaign-state.ts.) */

const BTG = ["BTG_ADMIN"];

describe("the moves BTG is offered", () => {
  it("Start staffing from DRAFT; Move to approval or Back to draft from STAFFING; Back to staffing from APPROVAL", () => {
    expect(stageMoves("DRAFT", BTG).map((m) => [m.to, m.label])).toEqual([["STAFFING", "Start staffing"]]);
    expect(stageMoves("STAFFING", BTG).map((m) => [m.to, m.label])).toEqual([["APPROVAL", "Move to approval"], ["DRAFT", "Back to draft"]]);
    expect(stageMoves("APPROVAL", ["CAMPAIGN_MGR"]).map((m) => [m.to, m.label])).toEqual([["STAFFING", "Back to staffing"]]);
  });

  it("nothing once live, and nothing for a role that doesn't run campaigns", () => {
    for (const s of ["ACTIVE", "REPORTING", "COMPLETED", "CANCELLED"]) expect(stageMoves(s, BTG)).toEqual([]);
    expect(stageMoves("STAFFING", ["NETWORK_MGR"])).toEqual([]);
    expect(stageMoves("STAFFING", ["SPONSOR_ADMIN"])).toEqual([]);
  });

  it("says what happened, and the API's refusal in its own words", () => {
    expect(stageMovedLine("APPROVAL")).toMatch(/Launch now/);
    expect(stageMoveRefusal(409, { error: { message: "A campaign cannot go from DRAFT to APPROVAL." } })).toBe("A campaign cannot go from DRAFT to APPROVAL.");
    expect(stageMoveRefusal(403, null)).toBe("Your role can't move this campaign.");
  });
});

describe("on the campaign page", () => {
  it("draws one button per move, the forward one primary", async () => {
    const { StageMoveButtons } = await import("@/components/stage-move-buttons");
    const html = renderToStaticMarkup(createElement(StageMoveButtons, { campaignId: "c1", moves: stageMoves("STAFFING", BTG), move: vi.fn() }));
    expect(html).toContain(">Move to approval</button>");
    expect(html).toContain(">Back to draft</button>");
    expect(html.indexOf("bg-primary")).toBeLessThan(html.indexOf("Back to draft"));
  });

  it("the page offers the moves through POST /campaigns/{id}/transition", () => {
    const page = readFileSync(new URL("../src/app/(app)/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/moves: stageMoves\(stage\?\.state \?\? ops\.campaign\.state, who\.actor\.roles\)/);
    expect(page).toMatch(/<StageMoveButtons campaignId=\{campaignId\} moves=\{moves\} move=\{moveCampaignStage\} \/>/);
    const actions = readFileSync(new URL("../src/app/(app)/admin/campaigns/[id]/actions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/\/campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/transition`, \{ method: "POST", body: JSON\.stringify\(\{ to \}\)/);
  });
});
