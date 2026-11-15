import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { autoStaffingNoteFor, maySendInvites, NOT_A_SENDER } from "@/lib/matching-live";

/* App review wave 3 — the campaign pipeline. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-63 · the BTG campaign desk sends people to the right place", () => {
  it("the Campaigns list always opens the campaign page; the campaign page opens the Studio on its own brief", () => {
    const board = src("app/(app)/admin/campaigns/campaigns-board.tsx");
    expect(board).toContain("const href = `/admin/campaigns/${encodeURIComponent(c.id)}`;");
    expect(board).not.toMatch(/href = STAFFING\.has/);
    const page = src("app/(app)/admin/campaigns/[id]/page.tsx");
    expect(page).toContain("const studioHref = stage?.briefId ? `/admin/campaigns/match?brief=${encodeURIComponent(stage.briefId)}` : \"/admin/campaigns/match\";");
    expect(page).toContain("Open in Matching Studio →");
    expect(page).toContain('action={{ label: "Open the Matching Studio", href: studioHref }}');
    expect(src("components/roster-ops.tsx")).toContain('href={live?.studioHref ?? "/admin/campaigns/match"}');
  });

  it("the network manager builds the shortlist but isn't offered Send, and is told who sends", () => {
    expect(maySendInvites(["NETWORK_MGR"])).toBe(false);
    expect(maySendInvites(["CAMPAIGN_MGR"])).toBe(true);
    expect(NOT_A_SENDER).toMatch(/campaign manager or BTG admin sends/);
    expect(src("lib/matching-live.ts")).toContain("sendBlocked: opts.send === false ? NOT_A_SENDER : sendBlockedFor(b),");
    expect(src("app/(app)/admin/campaigns/match/page.tsx")).toContain("send: maySendInvites(who.actor.roles)");
  });

  it("before Send, a package that staffs itself warns that automatic offers follow, up to its maximum", () => {
    const brief = { package: { athleteCountMax: 5 }, jobs: [{ jobId: "SX-01" }] } as unknown as Parameters<typeof autoStaffingNoteFor>[0];
    expect(autoStaffingNoteFor(brief)).toMatch(/up to the package's 5/);
    expect(src("components/matching-review.tsx")).toContain("{live && !sendBlocked && autoStaffingNote && (");
  });
});
