import { describe, expect, it } from "vitest";

import {
  CREATIVE_ACCEPT,
  captionHas,
  disclosureHint,
  missingDisclosures,
  passedChecks,
  waitedHours,
  waitingBadge,
  waitingWords,
} from "../src/lib/content-checks";
import { DESK_SUMMARY_QUERY, deskFilters, deskListQuery, toDeskItem } from "../src/lib/approvals-live";
import { nextStep, type ApiDeliverable } from "../src/lib/deliverables-live";
import {
  TABS,
  mergeBriefs,
  readinessSummary,
  toBriefRow,
  type ApiBrief,
} from "../src/lib/briefs-live";

/* --------------------------------------------------------------------------
   P4-FE-08 — the screens' pure helpers for P5-BE-09 (content checks and
   review waits) and P4-BE-07 (the brief readiness checklist).
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-14T12:00:00Z");

describe("content checks · the athlete's caption box", () => {
  it("previews the disclosure rule the API applies — ignoring case, whole token", () => {
    expect(captionHas("Game day #AD", "#ad")).toBe(true);
    expect(captionHas("new kicks #adidas", "#ad")).toBe(false);
    expect(missingDisclosures("Game day", ["#ad", "Paid partnership"])).toEqual(["#ad", "Paid partnership"]);
    expect(missingDisclosures("paid partnership #ad", ["#ad", "Paid partnership"])).toEqual([]);
  });

  it("says which disclosures are required, or that none are", () => {
    expect(disclosureHint(["#ad"])).toBe("Your caption must include #ad — the offer requires it.");
    expect(disclosureHint(["#ad", "Paid partnership"])).toBe("Your caption must include #ad and Paid partnership — the offer requires it.");
    expect(disclosureHint([])).toBe("No disclosure is required by this offer.");
  });

  it("the picker offers only the types the checks allow", () => {
    expect(CREATIVE_ACCEPT.split(",")).toEqual(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);
  });

  it("a draft the checks sent back is the athlete's to fix, worded as such", () => {
    const back = { reason: "No file attached", at: "2026-10-14T00:00:00Z", by: "SYSTEM" as const, failed: ["No file attached"] };
    expect(nextStep({ state: "DRAFT_SUBMITTED", appearance: false, revision: back })).toEqual({ label: "Fix before review", tone: "danger", on: "you" });
    expect(nextStep({ state: "DRAFT_SUBMITTED", appearance: false, revision: { ...back, by: "REVIEWER" } }).label).toBe("Revision requested");
  });

  it("keeps only the passed checks for display, and reads none as none", () => {
    expect(passedChecks([{ key: "file", ok: true, text: "File attached" }, { key: "fileType", ok: false, text: "x" }])).toHaveLength(1);
    expect(passedChecks(null)).toEqual([]);
  });
});

describe("review waits · the 'waiting 2 days' badges", () => {
  it("words the wait", () => {
    expect(waitingWords(0)).toBe("waiting under an hour");
    expect(waitingWords(5)).toBe("waiting 5 hours");
    expect(waitingWords(30)).toBe("waiting 1 day");
    expect(waitingWords(50)).toBe("waiting 2 days");
  });

  it("is late past the 48-hour reminder line, and absent without a time", () => {
    expect(waitedHours("2026-10-12T11:00:00Z", NOW)).toBe(49);
    expect(waitingBadge("2026-10-12T11:00:00Z", NOW)).toEqual({ label: "waiting 2 days", late: true });
    expect(waitingBadge("2026-10-13T12:00:00Z", NOW)).toEqual({ label: "waiting 1 day", late: false });
    expect(waitingBadge(null, NOW)).toBeNull();
    expect(waitingBadge("nonsense", NOW)).toBeNull();
  });
});

function d(over: Partial<ApiDeliverable> = {}): ApiDeliverable {
  return {
    id: "dl_1", title: "Showroom post", dueDate: "2026-10-20T00:00:00.000Z", state: "BTG_REVIEW",
    publishedUrl: null, publishedAt: null, orderId: "o", jobId: "SX-03", jobName: "Athlete Reel",
    appearance: false, athlete: { id: "a", displayName: "JORDAN" },
    campaign: { id: "c", name: "Fall Push", sponsorName: "Bowie Auto Group" },
    latestAsset: { version: 2, uploadedAt: "2026-10-13T09:00:00.000Z" }, assetCount: 2, revision: null,
    ...over,
  };
}

describe("BTG's content desk · checks, caption and wait", () => {
  it("carries the passed checks and the caption to the drawer", () => {
    const checks = [{ key: "file", ok: true, text: "File attached (version 2)" }];
    const it = toDeskItem(d({ checks, caption: "Game day #ad", captionVersion: 2 }), NOW);
    expect(it.live).toMatchObject({ checks, caption: "Game day #ad", captionVersion: 2 });
  });

  it("waits from when it reached the desk, when the API says so", () => {
    expect(toDeskItem(d({ waitingSince: "2026-10-12T12:00:00.000Z" }), NOW).waitingHours).toBe(48);
    /* Older rows without the field keep the latest-upload measure. */
    expect(toDeskItem(d(), NOW).waitingHours).toBe(27);
  });

  it("keeps drafts the automatic checks sent back off the queue and its counts", () => {
    expect(new URLSearchParams(deskListQuery(deskFilters({}), { page: 1, size: 12 })).get("systemReturned")).toBe("exclude");
    expect(DESK_SUMMARY_QUERY).toContain("systemReturned=exclude");
  });
});

const brief = (over: Partial<ApiBrief> = {}): ApiBrief => ({
  id: "b1", objective: "Drive foot traffic to the new store this fall season", state: "DRAFT", budget: 150_000,
  startDate: "2026-10-20T00:00:00.000Z", endDate: "2026-11-17T00:00:00.000Z", sports: ["Soccer"], stateCodes: [],
  categories: [], createdAt: "2026-10-01T00:00:00.000Z", sponsorName: "Harbor Coffee", package: null, campaign: null,
  ...over,
});
const checks = (failing: string[] = []) =>
  ["objective", "dates", "budget", "sponsor", "eligible", "conflicts"].map((key) => ({ key, ok: !failing.includes(key), text: key }));

describe("BTG's brief desk · the readiness checklist", () => {
  it("P4-FE-09 — 'Held for BTG' replaces 'Ready for review' as the first tab, the desk's default", () => {
    expect(TABS[0]).toEqual({ key: "held", label: "Held for BTG" });
    expect(TABS.some((t) => (t.key as string) === "ready")).toBe(false);
  });

  it("summarises the deciding checks — conflicts only inform", () => {
    expect(readinessSummary({ ready: true, checks: checks() })).toEqual({ label: "Ready for review", tone: "accent" });
    expect(readinessSummary({ ready: false, checks: checks(["budget", "dates"]) })).toEqual({ label: "3 of 5 checks pass", tone: "warn" });
    expect(readinessSummary(null)).toBeNull();
  });

  it("a brief without a checklist (a caller who doesn't see it) is never 'ready'", () => {
    const r = toBriefRow(brief());
    expect(r.readiness).toBeNull();
    expect(r.ready).toBe(false);
  });

  it("merges the newest briefs with every held one, once, newest first", () => {
    const all = [brief({ id: "n2", createdAt: "2026-10-02T00:00:00.000Z" }), brief({ id: "n1", createdAt: "2026-10-01T00:00:00.000Z" })];
    const held = [brief({ id: "n1" }), brief({ id: "old", createdAt: "2026-08-01T00:00:00.000Z" })];
    expect(mergeBriefs(all, held).map((b) => b.id)).toEqual(["n2", "n1", "old"]);
  });
});
