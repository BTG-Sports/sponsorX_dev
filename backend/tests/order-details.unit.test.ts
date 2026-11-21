/* POL-BE-116 — the Athlete Campaign Order template's details, as rules. No database. */
import { describe, expect, it } from "vitest";

import {
  athleteHolds, campaignHolds, defaultOrderDetails, deliverablesFromDetails, detailsForJob, exclusivityWords, JOB_IDS,
  mediaWords, orderCodeCandidates, orderNumber, parseOrderDetails, suggestOrderCode, usageWords, type OrderDetails,
} from "../src/domain/order-details-rules";

/** The template's own example: a 15–30 second vertical video, the "pregame playlist" campaign. */
const reel = (over: Partial<OrderDetails> = {}): OrderDetails => ({
  version: 1,
  prompt: "Before a game, I gotta have _____. / What's yours?",
  publishWindow: { start: "2026-12-01", end: "2026-12-20" },
  jobs: [{ jobId: "SX-03", media: { videos: 1, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "INSTAGRAM" } }],
  usage: { channels: ["INSTAGRAM", "TIKTOK"], periodDays: 90, territory: "United States", restrictions: null },
  paidMedia: { included: false },
  exclusivity: { included: false },
  disclosures: ["#ad", "Paid partnership"],
  sponsorApproval: true,
  paymentTiming: { daysAfterVerified: 15 },
  nonCash: null,
  ...over,
});

describe("POL-BE-116 · the order details", () => {
  it("the template's reel is a complete set of details", () => {
    expect(parseOrderDetails(reel())).toEqual({ ok: true, details: reel() });
  });

  it("every other medium has its own details, and each default is valid", () => {
    for (const jobId of JOB_IDS) {
      const d = defaultOrderDetails({ prompt: "Game day", start: new Date("2026-12-01"), end: new Date("2026-12-31"), jobIds: [jobId] });
      expect(parseOrderDetails(d).ok, jobId).toBe(true);
      expect(d.jobs[0]!.jobId).toBe(jobId);
    }
  });

  it("refuses an incomplete form in words: a medium's own fields, the window, paid media, exclusivity", () => {
    const wrongMedium = parseOrderDetails(reel({ jobs: [{ jobId: "SX-03", media: { frames: 3 } }] as never }));
    expect(wrongMedium.ok).toBe(false);
    if (!wrongMedium.ok) expect(wrongMedium.problems.join(" ")).toMatch(/jobs\.0\.media/);
    const short = parseOrderDetails(reel({ jobs: [{ jobId: "SX-03", media: { videos: 1, minSeconds: 30, maxSeconds: 15, orientation: "VERTICAL", platform: "INSTAGRAM" } }] }));
    expect(short.ok).toBe(false);
    expect(parseOrderDetails(reel({ publishWindow: { start: "2026-12-20", end: "2026-12-01" } })).ok).toBe(false);
    expect(parseOrderDetails(reel({ exclusivity: { included: true } as never })).ok).toBe(false);
    expect(parseOrderDetails(reel({ paidMedia: { included: true, kinds: [], platforms: [], durationDays: 30, territory: "US", extraCompensationCents: 100 } })).ok).toBe(false);
    expect(parseOrderDetails(reel({ paymentTiming: { daysAfterVerified: 120 } })).ok).toBe(false);
    expect(parseOrderDetails({ ...reel(), surprise: true }).ok).toBe(false);
  });

  it("says each medium in words, as a deliverable's title adds it", () => {
    expect(mediaWords(reel().jobs[0]!)).toBe("1 × 15–30 second vertical video for Instagram");
    expect(mediaWords({ jobId: "SX-01", media: { frames: 3, platform: "INSTAGRAM", link: "LINK_STICKER", hoursLive: 24 } })).toBe("3 story frames on Instagram, up for 24 hours, with a link sticker");
    expect(mediaWords({ jobId: "SX-05", media: { event: "Store opening", startsAt: "2026-12-05T17:00:00.000Z", place: "Bowie Mall", hoursOnSite: 2, activities: "Photos with fans", filmedBy: "SPONSOR" } })).toBe("Store opening at Bowie Mall, 2 hours on site — Photos with fans");
  });

  it("a reel campaign owes one deliverable per video, each titled with what it asks for", () => {
    const due = new Date("2026-12-20T23:59:59Z");
    const two = { jobId: "SX-03", media: { videos: 2, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "TIKTOK" } };
    expect(deliverablesFromDetails([{ title: "Athlete reel", dueDate: due }], two)).toEqual([
      { title: "Athlete reel 1 of 2 — 2 × 15–30 second vertical videos for TikTok", dueDate: due },
      { title: "Athlete reel 2 of 2 — 2 × 15–30 second vertical videos for TikTok", dueDate: due },
    ]);
    const post = { jobId: "SX-02", media: { format: "CAROUSEL", images: 4, platform: "INSTAGRAM", caption: null, daysLive: 60 } };
    expect(deliverablesFromDetails([{ title: "Sponsored feed post", dueDate: due }], post)[0]!.title).toBe("Sponsored feed post — a 4-image carousel on Instagram, kept up 60 days");
  });

  it("fills the order's one-line fields: usage (with paid media) and exclusivity", () => {
    expect(usageWords(reel())).toBe("Organic use on Instagram, TikTok, during the publish window and for 90 days after it ends, in United States. Paid media is not included.");
    const paid = reel({ paidMedia: { included: true, kinds: ["BOOSTED_POSTS"], platforms: ["INSTAGRAM"], durationDays: 30, territory: "Maryland", extraCompensationCents: 15_000 } });
    expect(usageWords(paid)).toMatch(/Paid media included: boosted posts on Instagram, for 30 days, in Maryland, for \$150 more\.$/);
    expect(exclusivityWords(reel())).toBeNull();
    expect(exclusivityWords(reel({ exclusivity: { included: true, category: "Sports drinks", days: 60, scope: "Maryland" } }))).toBe("Sports drinks, for 60 days from acceptance, in Maryland");
  });

  it("one job's slice keeps everything else", () => {
    const two = reel({ jobs: [...reel().jobs, { jobId: "SX-01", media: { frames: 2, platform: "INSTAGRAM", link: "NONE", hoursLive: 24 } }] });
    expect(detailsForJob(two, "SX-01").jobs.map((j) => j.jobId)).toEqual(["SX-01"]);
    expect(detailsForJob(two, "SX-01").paymentTiming).toEqual({ daysAfterVerified: 15 });
  });

  it("automation rules: what holds a whole campaign, and what holds one athlete", () => {
    expect(campaignHolds(reel(), ["SPORTS_NUTRITION"])).toEqual([]);
    /* A sensitive category was already held for a person when its brief was approved. */
    expect(campaignHolds(reel(), ["ALCOHOL"])).toEqual([]);
    expect(campaignHolds(reel({ paidMedia: { included: true, kinds: ["DIGITAL_ADS"], platforms: [], durationDays: 30, territory: "US", extraCompensationCents: 0 } }), [])[0]).toMatch(/no extra pay/);
    const adult = { birthDate: null, ageBand: "18_PLUS" };
    const minor = { birthDate: null, ageBand: "16_17" };
    const both = reel({ paidMedia: { included: true, kinds: ["DIGITAL_ADS"], platforms: [], durationDays: 30, territory: "US", extraCompensationCents: 500 }, exclusivity: { included: true, category: "Shoes", days: 30, scope: "US" } });
    expect(athleteHolds(both, adult)).toEqual([]);
    expect(athleteHolds(reel(), minor)).toEqual([]);
    expect(athleteHolds(both, minor)).toHaveLength(2);
  });

  it("order numbers: three letters from the name, the next free one when taken, SX-<code>-<year>-<n>", () => {
    expect(suggestOrderCode("What's your pregame meal?")).toBe("PME");
    expect(suggestOrderCode("What's on your pregame playlist?")).toBe("PPL");
    expect(suggestOrderCode("Fall Tacos")).toBe("FTA");
    expect(suggestOrderCode("!!!")).toBe("SPX");
    const c = [...orderCodeCandidates("PPL")].slice(0, 3);
    expect(c).toEqual(["PPL", "PPA", "PPB"]);
    expect(orderNumber("PGM", 2026, 7)).toBe("SX-PGM-2026-0007");
  });
});
