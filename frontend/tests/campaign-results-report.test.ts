import { describe, expect, it } from "vitest";

import { buildCampaignResultsReport } from "../src/lib/campaign-results-report";
import type { ApiSponsorReport } from "../src/lib/report-live";
import { deliverableWord, orderWord } from "../src/lib/sponsor-words";

/* --------------------------------------------------------------------------
   The real campaign's export (staging dry run, 2026-10-26: only the sample
   campaigns could download a report). The file must say what the screen
   says: checked reach apart from every other source, never summed; the cost
   per 1,000 only when there is checked reach; the screen's own words.
   -------------------------------------------------------------------------- */

const zero = { VERIFIED_API: 0, VERIFIED_MANUAL: 0, SELF_REPORTED: 0, ESTIMATED: 0, ATTRIBUTED: 0 };

function report(over: Partial<ApiSponsorReport> = {}): ApiSponsorReport {
  return {
    campaign: { id: "cmp_1", name: "Harbor Coffee · SponsorX Test Drive", state: "ACTIVE", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-11-30T00:00:00.000Z", budget: 500_000 },
    objective: "Drive store visits.",
    roster: [{ athleteId: "a1", athleteName: "JORDAN", jobId: "SX-02", orderState: "ACTIVE", deliverablesTotal: 2, deliverablesVerified: 1 }],
    deliveredAssets: [
      { deliverableId: "d1", title: "Sponsored post", state: "VERIFIED", publishedUrl: "https://instagram.com/p/1", publishedAt: "2026-10-20T00:00:00.000Z", trackedClicks: 42 },
    ],
    performance: {
      views: { ...zero, VERIFIED_API: 1000, VERIFIED_MANUAL: 500, SELF_REPORTED: 800 },
      engagements: { ...zero, VERIFIED_API: 60, VERIFIED_MANUAL: 15, SELF_REPORTED: 40 },
      verifiedViews: 1500,
      verifiedEngagements: 75,
    },
    funnel: { SCAN: 100, LANDING: 80, CLAIM: 30, REDEEM: 12 },
    adPlacements: [],
    editionEngagement: null,
    redemption: { issued: 30, redeemed: 12, rate: 0.4 },
    mediaValue: { amount: 1250, basis: "spend / verified impressions × 1000", source: "ESTIMATED" },
    observations: ["Most redemptions came in the first week."],
    ...over,
  };
}

const AS_OF = new Date("2026-10-26T15:00:00.000Z");

describe("buildCampaignResultsReport", () => {
  it("keeps checked reach apart from what athletes reported", () => {
    const m = buildCampaignResultsReport(report(), null, AS_OF);
    expect(m.headline.reached).toBe(1500);
    expect(m.headline.otherReach).toBe(800);
    expect(m.headline.engagementRate).toBeCloseTo(0.05);
    expect(m.sources.map((s) => [s.label, s.checked, s.views])).toEqual([
      ["Checked with the platform", true, 1000],
      ["Checked by BTG", true, 500],
      ["Reported by the athlete", false, 800],
    ]);
  });

  it("gives a cost per 1,000 only when there is checked reach", () => {
    expect(buildCampaignResultsReport(report(), null, AS_OF).headline.costPerThousandCents).toBe(1250);
    const none = report({ performance: { views: zero, engagements: zero, verifiedViews: 0, verifiedEngagements: 0 } });
    const m = buildCampaignResultsReport(none, null, AS_OF);
    expect(m.headline.costPerThousandCents).toBeNull();
    expect(m.headline.engagementRate).toBeNull();
    expect(m.sources).toEqual([]);
  });

  it("labels a sample as a sample — title, file and footnote (QA pass 3)", () => {
    const m = buildCampaignResultsReport(report(), null, AS_OF, { sample: true });
    expect(m.meta.title).toBe("Campaign Results (sample)");
    expect(m.meta.fileStem).toMatch(/-SAMPLE$/);
    expect(m.meta.footnote).toMatch(/^Sample data — not a real campaign/);
    expect(buildCampaignResultsReport(report(), null, AS_OF).meta.title).toBe("Campaign Results");
  });

  it("names the file after the campaign and the day, filename-safe", () => {
    expect(buildCampaignResultsReport(report(), null, AS_OF).meta.fileStem).toBe("SponsorX-Results-Harbor-Coffee-SponsorX-Test-Drive-2026-10-26");
  });

  it("carries the best athletes with the window they cover, or none when the overview is hidden", () => {
    const m = buildCampaignResultsReport(report(), { window: "30d", athletes: [{ name: "JORDAN", sport: "Soccer", views: 900 }] }, AS_OF);
    expect(m.bestAthletes).toEqual({ window: "last 30 days", rows: [{ rank: 1, name: "JORDAN", sport: "Soccer", reached: 900 }] });
    expect(buildCampaignResultsReport(report(), null, AS_OF).bestAthletes).toBeNull();
  });

  it("lists the athletes, posts and funnel in the screen's words", () => {
    const m = buildCampaignResultsReport(report(), null, AS_OF);
    expect(m.athletes).toEqual([{ name: "JORDAN", job: "Sponsored Post", order: orderWord("ACTIVE").text, checked: 1, total: 2 }]);
    expect(m.posts[0]).toEqual({ title: "Sponsored post", status: deliverableWord("VERIFIED").text, publishedAt: "Oct 20, 2026", url: "https://instagram.com/p/1", clicks: 42 });
    expect(m.funnel.map((f) => f.fans)).toEqual([100, 80, 30, 12]);
    expect(m.placements).toBeNull();
  });
});

describe("the renderers", () => {
  const m = buildCampaignResultsReport(
    report({ adPlacements: [{ slotCode: "A1", kind: "FULL", editionId: "e1", soldCents: 1 }], editionEngagement: { print: { QR_SCAN: 5 }, digital: { LINK_CLICK: 3, PROFILE_VIEW: 0, CAMPAIGN_VIEW: 0, CTA_CLICK: 0 } } }),
    { window: "all", athletes: [{ name: "JORDAN", sport: null, views: 900 }] },
    AS_OF,
  );

  it("prints a PDF", async () => {
    const { generateCampaignResultsPdf } = await import("../src/lib/campaign-results-pdf");
    const blob = generateCampaignResultsPdf(m);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
  }, 30_000);

  it("writes a workbook with a sheet per table", async () => {
    const { generateCampaignResultsXlsx } = await import("../src/lib/campaign-results-xlsx");
    const ExcelJS = (await import("exceljs")).default;
    const blob = await generateCampaignResultsXlsx(m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Reach by source", "Athletes", "Posts"]);
    expect(wb.getWorksheet("Posts")!.getRow(2).getCell(4).value).toBe(42);
  }, 30_000); /* exceljs is a heavy first import on a cold worker */
});
