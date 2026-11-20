import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CampaignBriefInput } from "../../backend/src/contracts/campaign";
import {
  DEFAULT_PAYMENT_DAYS, DEFAULT_USAGE_DAYS, FILMED_BY, JOB_IDS as API_JOB_IDS, MEDIA_BY_JOB, ORDER_CHANNELS, OrderDetailsSchema, PAID_MEDIA_KINDS, PLATFORMS,
  athleteHolds as apiAthleteHolds, campaignHolds as apiCampaignHolds, defaultMedia, defaultOrderDetails, mediaWords as apiMediaWords, suggestOrderCode as apiSuggestOrderCode,
} from "../../backend/src/domain/order-details-rules";
import {
  BUILDER_STEPS, asksStates, blankDraft, buildCampaign, countryName, countryOptions, dollarsCents, fieldWords, firstProblemStep, isCatalogue, mediaDraftFor, mediaOf,
  momentOf, orderDetailsOf, orderNumberPreview, stateOptions, stepAnswer, stepProblems, suggestOrderCode, toggleJob, withCountry, withDates,
  type BuilderCatalogue, type BuilderDraft,
} from "../src/lib/campaign-builder";
import {
  JOB_IDS, JOB_NAME, approvalWords, centsWords, exclusivityLine, mediaRows, mediaWords, orderHoldReasons, orderSheet, paidMediaLine, paidMediaNeedsPay, paymentWords,
  readOrderDetails, usagePeriodWords, windowWords, type OrderDetails,
} from "../src/lib/order-details";

/* POL-FE-107 and POL-FE-116 — the sponsor's campaign builder: what each step
   checks, and the exact request it sends. Everything the builder lets through
   is parsed here with the API's own contract (CampaignBriefInput, which holds
   OrderDetailsSchema), so a drift between the two fails this file rather than
   a sponsor's campaign. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-20T15:00:00.000Z");

/* The catalogue as GET /campaign-builder/catalogue answers it (campaign-order-details.ts
   builderCatalogue): the fields are its MEDIA_FIELDS, the defaults the API's own defaultMedia. */
const FIELDS: Record<string, BuilderCatalogue["jobs"][number]["fields"]> = {
  "SX-01": [{ field: "frames", kind: "integer", min: 1, max: 10 }, { field: "platform", kind: "choice", choices: PLATFORMS }, { field: "link", kind: "choice", choices: ["NONE", "LINK_STICKER", "SWIPE_UP"] }, { field: "hoursLive", kind: "integer", min: 1, max: 72 }],
  "SX-02": [{ field: "format", kind: "choice", choices: ["SINGLE_IMAGE", "CAROUSEL", "VIDEO"] }, { field: "images", kind: "integer", min: 1, max: 10 }, { field: "platform", kind: "choice", choices: PLATFORMS }, { field: "caption", kind: "text?", max: 500 }, { field: "daysLive", kind: "integer", min: 1, max: 365 }],
  "SX-03": [{ field: "videos", kind: "integer", min: 1, max: 5 }, { field: "minSeconds", kind: "integer", min: 5, max: 180 }, { field: "maxSeconds", kind: "integer", min: 5, max: 180 }, { field: "orientation", kind: "choice", choices: ["VERTICAL", "HORIZONTAL", "SQUARE"] }, { field: "platform", kind: "choice", choices: PLATFORMS }],
  "SX-04": [{ field: "product", kind: "text", max: 200 }, { field: "contentFormat", kind: "choice", choices: ["VIDEO", "PHOTO", "BOTH"] }, { field: "productKept", kind: "boolean" }],
  "SX-05": [{ field: "event", kind: "text", max: 200 }, { field: "startsAt", kind: "datetime" }, { field: "place", kind: "text", max: 300 }, { field: "hoursOnSite", kind: "number", min: 0.5, max: 12 }, { field: "activities", kind: "text", max: 500 }, { field: "filmedBy", kind: "choice", choices: FILMED_BY }],
  "SX-06": [{ field: "shootDate", kind: "date" }, { field: "place", kind: "text", max: 300 }, { field: "hours", kind: "number", min: 1, max: 12 }, { field: "finishedPieces", kind: "integer", min: 1, max: 50 }, { field: "filmedBy", kind: "choice", choices: FILMED_BY }, { field: "rawFootageIncluded", kind: "boolean" }],
  "SX-07": [{ field: "months", kind: "integer", min: 1, max: 12 }, { field: "monthlyMix", kind: "list", choices: ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06"] }],
};
const WINDOW = { start: "2026-11-20", end: "2026-12-20" };
const CATALOGUE: BuilderCatalogue = {
  jobs: API_JOB_IDS.map((jobId) => ({ jobId, name: JOB_NAME[jobId], fields: FIELDS[jobId], defaults: defaultMedia(jobId, WINDOW) })),
  channels: ORDER_CHANNELS,
  platforms: PLATFORMS,
  paidMediaKinds: PAID_MEDIA_KINDS,
  defaults: { usagePeriodDays: DEFAULT_USAGE_DAYS, paymentDaysAfterVerified: DEFAULT_PAYMENT_DAYS, disclosures: ["#ad"], territory: "United States", sponsorApproval: false },
  limits: { usagePeriodDays: 730, exclusivityDays: 730, paymentDaysAfterVerified: 90 },
};
const CTX = { catalogue: CATALOGUE, countries: ["US", "CA", "PH"], now: NOW };

/** A campaign every step accepts: one reel, in the United States. */
function ready(over: Partial<BuilderDraft> = {}): BuilderDraft {
  const d = toggleJob(blankDraft(CATALOGUE, NOW), "SX-03", CATALOGUE);
  return {
    ...d,
    name: "What's on your pregame playlist?",
    goal: "Get local students talking about our new store before the season opens",
    budget: "2,500",
    prompt: "Before a game, I gotta have ___. What's yours?",
    ...over,
  };
}
const body = (d: BuilderDraft) => {
  const r = buildCampaign(d, "sp_1", CTX);
  if (!r.ok) throw new Error(`not ready: step ${r.step} ${JSON.stringify(r.problems)}`);
  return r.body;
};

describe("a blank campaign", () => {
  it("starts in two weeks, runs four, in the United States, on the standard terms", () => {
    const d = blankDraft(CATALOGUE, NOW);
    expect(d.start).toBe("2026-12-04");
    expect(d.end).toBe("2027-01-01");
    expect([d.windowStart, d.windowEnd]).toEqual([d.start, d.end]);
    expect(d.country).toBe("US");
    expect(d.territory).toBe("United States");
    expect(d.disclosures).toEqual(["#ad"]);
    expect(d.usageDays).toBe("90");
    expect(d.paymentDays).toBe("30");
    expect(d.jobs).toEqual([]);
    expect(d.paid).toBe(false);
    expect(d.exclusive).toBe(false);
  });
  it("has nothing chosen for it: no package is ever sent (§107)", () => {
    expect(body(ready()).packageId).toBeNull();
    expect(src("lib/campaign-builder.ts")).toContain("packageId: null");
  });
  it("knows a catalogue from something that isn't one", () => {
    expect(isCatalogue(CATALOGUE)).toBe(true);
    expect(isCatalogue({ jobs: [] })).toBe(false);
    expect(isCatalogue(null)).toBe(false);
    expect(isCatalogue({ ...CATALOGUE, limits: undefined })).toBe(false);
  });
});

describe("the request (POST /briefs)", () => {
  it("is one the API's own contract accepts, with the order details whole", () => {
    const b = body(ready());
    const parsed = CampaignBriefInput.parse(b);
    expect(parsed.packageId).toBeNull();
    expect(parsed.countryCode).toBe("US");
    expect(parsed.budget).toBe(250_000);
    expect(parsed.orderDetails?.jobs).toEqual([{ jobId: "SX-03", media: { videos: 1, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "INSTAGRAM" } }]);
    expect(parsed.orderDetails?.publishWindow).toEqual({ start: b.startDate, end: b.endDate });
    expect(parsed.orderDetails?.paymentTiming).toEqual({ daysAfterVerified: 30 });
  });
  it("carries the goal first and the campaign's name under it, since the brief has no name of its own", () => {
    expect(body(ready()).objective).toBe("Get local students talking about our new store before the season opens\n\nCampaign name: What's on your pregame playlist?");
  });
  it("sends everything §107 asks for: country, states, sports, audience, channels and both category lists", () => {
    const b = body(ready({
      states: ["MD", "VA", "ZZ"], sports: ["Basketball", "Soccer"], tiers: ["CREATOR", "ANCHOR", "NOPE"], minFollowers: "10k", channels: ["TIKTOK", "IN_PERSON"],
      category: "RESTAURANT", avoid: ["ALCOHOL", "GAMBLING"],
    }));
    expect(b.stateCodes).toEqual(["MD", "VA"]);
    expect(b.sports).toEqual(["Basketball", "Soccer"]);
    expect(b.audienceTiers).toEqual(["CREATOR", "ANCHOR"]);
    expect(b.audienceMinFollowers).toBe(10_000);
    expect(b.channels).toEqual(["TIKTOK", "IN_PERSON"]);
    expect(b.categories).toEqual(["RESTAURANT"]);
    expect(b.excludedCategories).toEqual(["ALCOHOL", "GAMBLING"]);
    expect(() => CampaignBriefInput.parse(b)).not.toThrow();
  });
  it("sends the order code in capitals, or none when it was left for the API to make", () => {
    expect(body(ready({ orderCode: "pgm" })).orderCode).toBe("PGM");
    expect(body(ready({ orderCode: "" })).orderCode).toBeNull();
  });
  it("is not built while a step still has something wrong, and says which step", () => {
    const r = buildCampaign(ready({ budget: "" }), "sp_1", CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(BUILDER_STEPS[r.step].id).toBe("budget");
      expect(r.problems.budget).toMatch(/budget/i);
    }
  });
});

describe("country and states (§107)", () => {
  it("lists the United States first, then where athletes are, by name", () => {
    expect(countryOptions(["PH", "ca", "US", "CA", "nope"])).toEqual([
      { value: "US", label: "United States" },
      { value: "CA", label: "Canada" },
      { value: "PH", label: "Philippines" },
    ]);
    expect(countryOptions([])).toEqual([{ value: "US", label: "United States" }]);
    expect(countryName("zz1")).toBe("zz1");
  });
  it("asks for states only in the United States", () => {
    expect(asksStates("US")).toBe(true);
    expect(asksStates("CA")).toBe(false);
  });
  it("drops the states when the campaign moves abroad, and the territories follow the country", () => {
    const d = withCountry(ready({ states: ["MD", "VA"] }), "CA");
    expect(d.states).toEqual([]);
    expect([d.territory, d.paidTerritory, d.exclScope]).toEqual(["Canada", "Canada", "Canada"]);
    const b = body(d);
    expect(b.countryCode).toBe("CA");
    expect(b.stateCodes).toEqual([]);
    expect(b.orderDetails.usage.territory).toBe("Canada");
  });
  it("keeps a territory the sponsor wrote themselves", () => {
    expect(withCountry(ready({ territory: "North America" }), "CA").territory).toBe("North America");
  });
  it("never sends a state with another country, even if one is still in the draft", () => {
    const d = { ...ready(), country: "CA", states: ["MD"] };
    expect(stepProblems("reach", d, CTX).states).toMatch(/United States/);
    expect(buildCampaign(d, "sp_1", CTX).ok).toBe(false);
  });
  it("refuses a country no athlete is in", () => {
    expect(stepProblems("reach", { ...ready(), country: "FR" }, CTX).country).toMatch(/No athlete/);
    expect(stepProblems("reach", ready(), CTX)).toEqual({});
  });
  it("offers the states athletes are in by name, or all of them when it doesn't know", () => {
    expect(stateOptions(["VA", "MD", "XX"])).toEqual([{ value: "MD", label: "Maryland" }, { value: "VA", label: "Virginia" }]);
    expect(stateOptions([])).toHaveLength(51);
  });
});

describe("each step's checks", () => {
  it("campaign: a name, and a goal of at least eight words", () => {
    expect(stepProblems("campaign", ready(), CTX)).toEqual({});
    const p = stepProblems("campaign", ready({ name: " ", goal: "Sell more" }), CTX);
    expect(p.name).toMatch(/name/);
    expect(p.goal).toMatch(/at least 8 words/);
  });
  it("budget and dates: an amount, a start after today, and at least a week", () => {
    expect(stepProblems("budget", ready(), CTX)).toEqual({});
    expect(stepProblems("budget", ready({ budget: "lots" }), CTX).budget).toMatch(/dollars/);
    expect(stepProblems("budget", ready({ budget: "0" }), CTX).budget).toMatch(/dollars/);
    expect(stepProblems("budget", ready({ start: "2026-11-20" }), CTX).start).toMatch(/after today/);
    expect(stepProblems("budget", ready({ start: "2026-12-01", end: "2026-12-05" }), CTX).end).toMatch(/at least 7 days/);
    expect(stepProblems("budget", ready({ start: "2026-12-01", end: "2026-12-08" }), CTX)).toEqual({});
  });
  it("who to reach: a minimum audience is a number of followers", () => {
    expect(stepProblems("reach", ready({ minFollowers: "many" }), CTX).minFollowers).toMatch(/followers/);
    expect(stepProblems("reach", ready({ minFollowers: "1.5m" }), CTX)).toEqual({});
  });
  it("brand safety: your own category can't also be one to avoid", () => {
    expect(stepProblems("safety", ready({ category: "ALCOHOL", avoid: ["ALCOHOL"] }), CTX).avoid).toMatch(/can't also/);
    expect(stepProblems("safety", ready({ category: "", avoid: ["ALCOHOL"] }), CTX)).toEqual({});
  });
  it("jobs: a prompt and at least one job", () => {
    const p = stepProblems("jobs", { ...blankDraft(CATALOGUE, NOW) }, CTX);
    expect(p.prompt).toMatch(/prompt/);
    expect(p.jobs).toMatch(/at least one job/);
    expect(stepProblems("jobs", ready(), CTX)).toEqual({});
  });
  it("deliverables: the publish window sits inside the campaign's dates, and a disclosure is picked", () => {
    expect(stepProblems("deliverables", ready(), CTX)).toEqual({});
    const d = ready();
    expect(stepProblems("deliverables", { ...d, windowStart: addDay(d.start, -1) }, CTX).windowStart).toMatch(/inside the campaign's dates/);
    expect(stepProblems("deliverables", { ...d, windowEnd: addDay(d.end, 1) }, CTX).windowStart).toMatch(/inside the campaign's dates/);
    expect(stepProblems("deliverables", { ...d, windowStart: d.end, windowEnd: d.start }, CTX).windowEnd).toMatch(/on or after/);
    expect(stepProblems("deliverables", { ...d, disclosures: [] }, CTX).disclosures).toMatch(/at least one/);
  });
  it("usage: a channel, a period within the limit, a territory; paid media asks for its own details", () => {
    expect(stepProblems("usage", ready(), CTX)).toEqual({});
    const p = stepProblems("usage", ready({ usageChannels: [], usageDays: "731", territory: "" }), CTX);
    expect(p.usageChannels).toMatch(/at least one channel/);
    expect(p.usageDays).toMatch(/0 to 730/);
    expect(p.territory).toBeTruthy();
    const paid = stepProblems("usage", ready({ paid: true, paidDays: "0", paidTerritory: "", paidExtra: "a lot" }), CTX);
    expect(Object.keys(paid).sort()).toEqual(["paidDays", "paidExtra", "paidKinds", "paidTerritory"]);
    expect(stepProblems("usage", ready({ paid: true, paidKinds: ["BOOSTED_POSTS"], paidExtra: "" }), CTX)).toEqual({});
  });
  it("terms: exclusivity asks for its category, period and area; payment within 90 days; a three-letter code", () => {
    expect(stepProblems("terms", ready(), CTX)).toEqual({});
    const p = stepProblems("terms", ready({ exclusive: true, exclCategory: "", exclDays: "900", exclScope: "" }), CTX);
    expect(Object.keys(p).sort()).toEqual(["exclCategory", "exclDays", "exclScope"]);
    expect(stepProblems("terms", ready({ paymentDays: "91" }), CTX).paymentDays).toMatch(/0 to 90/);
    expect(stepProblems("terms", ready({ orderCode: "AB" }), CTX).orderCode).toMatch(/three letters/);
    expect(stepProblems("terms", ready({ orderCode: "abc" }), CTX)).toEqual({});
  });
  it("finds the first step that isn't ready, in the order the steps run", () => {
    expect(firstProblemStep(ready(), CTX)).toBeNull();
    expect(firstProblemStep(ready({ prompt: "", usageChannels: [] }), CTX)?.step).toBe(BUILDER_STEPS.findIndex((s) => s.id === "jobs"));
  });
});

describe("each job's medium (§116)", () => {
  it("starts every job from the API's defaults, and what it sends parses with the API's own schema for that job", () => {
    const start = "2026-12-04";
    for (const job of CATALOGUE.jobs) {
      const typed = mediaDraftFor(job, start);
      const { media, problems } = mediaOf(job, typed);
      expect(problems, job.jobId).toEqual({});
      expect(() => MEDIA_BY_JOB[job.jobId as keyof typeof MEDIA_BY_JOB].parse(media), job.jobId).not.toThrow();
    }
  });
  it("has words for every field the catalogue lists", () => {
    for (const job of CATALOGUE.jobs) for (const f of job.fields) expect(fieldWords(job.jobId, f.field).label, `${job.jobId}.${f.field}`).not.toMatch(/^[a-z]/);
    expect(fieldWords("SX-99", "newField").label).toBe("New field");
  });
  it("puts a job's dates on the campaign's first day, and moves them when the dates move", () => {
    let d = toggleJob(toggleJob(ready(), "SX-05", CATALOGUE), "SX-06", CATALOGUE);
    expect(d.media["SX-05"].startsAt).toBe(`${d.start}T17:00`);
    expect(d.media["SX-06"].shootDate).toBe(d.start);
    d = withDates(d, "2027-02-01", "2027-03-01");
    expect(d.media["SX-05"].startsAt).toBe("2027-02-01T17:00");
    expect(d.media["SX-06"].shootDate).toBe("2027-02-01");
    expect([d.windowStart, d.windowEnd]).toEqual(["2027-02-01", "2027-03-01"]);
  });
  it("leaves a publish window the sponsor narrowed where they put it", () => {
    const d = ready();
    const narrowed = withDates({ ...d, windowStart: addDay(d.start, 3) }, d.start, addDay(d.end, 7));
    expect(narrowed.windowStart).toBe(addDay(d.start, 3));
    expect(narrowed.windowEnd).toBe(d.end);
  });
  it("keeps the jobs in the catalogue's order, and what was typed for a job that is dropped and picked again", () => {
    let d = toggleJob(toggleJob(blankDraft(CATALOGUE, NOW), "SX-06", CATALOGUE), "SX-01", CATALOGUE);
    expect(d.jobs).toEqual(["SX-01", "SX-06"]);
    d = { ...d, media: { ...d.media, "SX-01": { ...d.media["SX-01"], frames: "5" } } };
    d = toggleJob(toggleJob(d, "SX-01", CATALOGUE), "SX-01", CATALOGUE);
    expect(d.media["SX-01"].frames).toBe("5");
    expect(toggleJob(d, "SX-99", CATALOGUE).jobs).toEqual(d.jobs);
  });
  it("checks each field against the catalogue's limits, in words", () => {
    const reel = CATALOGUE.jobs.find((j) => j.jobId === "SX-03")!;
    const p = mediaOf(reel, { videos: "9", minSeconds: "40", maxSeconds: "20", orientation: "ROUND", platform: "INSTAGRAM" }).problems;
    expect(p["media.SX-03.videos"]).toBe("Videos is a whole number from 1 to 5 videos.");
    expect(p["media.SX-03.maxSeconds"]).toBe("The longest length is at least the shortest.");
    expect(p["media.SX-03.orientation"]).toBe("Format: pick one.");
    const post = CATALOGUE.jobs.find((j) => j.jobId === "SX-02")!;
    expect(mediaOf(post, { ...mediaDraftFor(post, "2026-12-04"), format: "CAROUSEL", images: "1" }).problems["media.SX-02.images"]).toMatch(/at least two/);
    expect(mediaOf(post, { ...mediaDraftFor(post, "2026-12-04"), caption: "  " }).media.caption).toBeNull();
    const visit = CATALOGUE.jobs.find((j) => j.jobId === "SX-05")!;
    const v = mediaOf(visit, { ...mediaDraftFor(visit, "2026-12-04"), event: "", hoursOnSite: "0.25", startsAt: "soon" }).problems;
    expect(Object.keys(v).sort()).toEqual(["media.SX-05.event", "media.SX-05.hoursOnSite", "media.SX-05.startsAt"]);
    expect(mediaOf(visit, { ...mediaDraftFor(visit, "2026-12-04"), hoursOnSite: "1.5" }).media.hoursOnSite).toBe(1.5);
  });
  it("turns a date and time into the moment the API stores", () => {
    expect(momentOf("2026-12-04T17:00")).toBe(new Date("2026-12-04T17:00").toISOString());
    expect(momentOf("2026-12-04")).toBeNull();
    expect(momentOf("")).toBeNull();
  });
  it("a monthly ambassador's mix is the jobs with a number, and needs at least one", () => {
    const amb = CATALOGUE.jobs.find((j) => j.jobId === "SX-07")!;
    expect(mediaDraftFor(amb, "2026-12-04")).toEqual({ months: "1", "mix:SX-02": "4" });
    expect(mediaOf(amb, { months: "3", "mix:SX-01": "2", "mix:SX-02": "0", "mix:SX-03": "1" }).media).toEqual({ months: 3, monthlyMix: [{ jobId: "SX-01", quantity: 2 }, { jobId: "SX-03", quantity: 1 }] });
    expect(mediaOf(amb, { months: "3" }).problems["media.SX-07.monthlyMix"]).toMatch(/at least one job/);
    expect(mediaOf(amb, { months: "3", "mix:SX-01": "11" }).problems["media.SX-07.monthlyMix"]).toMatch(/1 to 10/);
  });
  it("every job picked at once, with paid media and exclusivity, is a request the API accepts", () => {
    let d = ready();
    for (const id of JOB_IDS) if (!d.jobs.includes(id)) d = toggleJob(d, id, CATALOGUE);
    d = {
      ...d, paid: true, paidKinds: ["BOOSTED_POSTS", "WHITELISTING"], paidPlatforms: ["INSTAGRAM", "SPONSOR_WEBSITE"], paidDays: "45", paidExtra: "$150.50",
      exclusive: true, exclCategory: "Sports drinks", exclDays: "60", sponsorApproval: true, paymentDays: "15", nonCash: "A pair of shoes", restrictions: "No edits to the athlete's voice.",
      disclosures: ["#ad", "Paid partnership", " "], usageChannels: ["INSTAGRAM", "TIKTOK", "SPONSOR_EMAIL"], usageDays: "0",
    };
    const b = body(d);
    const parsed = CampaignBriefInput.parse(b);
    expect(parsed.orderDetails?.jobs.map((j) => j.jobId)).toEqual([...JOB_IDS]);
    expect(parsed.orderDetails?.paidMedia).toEqual({ included: true, kinds: ["BOOSTED_POSTS", "WHITELISTING"], platforms: ["INSTAGRAM", "SPONSOR_WEBSITE"], durationDays: 45, territory: "United States", extraCompensationCents: 15_050 });
    expect(parsed.orderDetails?.exclusivity).toEqual({ included: true, category: "Sports drinks", days: 60, scope: "United States" });
    expect(parsed.orderDetails?.disclosures).toEqual(["#ad", "Paid partnership"]);
    expect(parsed.orderDetails?.usage).toEqual({ channels: ["INSTAGRAM", "TIKTOK", "SPONSOR_EMAIL"], periodDays: 0, territory: "United States", restrictions: "No edits to the athlete's voice." });
    expect(parsed.orderDetails?.sponsorApproval).toBe(true);
    expect(parsed.orderDetails?.paymentTiming.daysAfterVerified).toBe(15);
    expect(parsed.orderDetails?.nonCash).toBe("A pair of shoes");
  });
  it("paid media with no extra pay is sent as $0, which the API holds for BTG", () => {
    const d = orderDetailsOf(ready({ paid: true, paidKinds: ["DIGITAL_ADS"] }), CATALOGUE);
    expect(d.paidMedia).toMatchObject({ included: true, extraCompensationCents: 0 });
    expect(paidMediaNeedsPay(d)).toBe(true);
    expect(paidMediaNeedsPay(orderDetailsOf(ready({ paid: true, paidKinds: ["DIGITAL_ADS"], paidExtra: "100" }), CATALOGUE))).toBe(false);
    expect(paidMediaNeedsPay(orderDetailsOf(ready(), CATALOGUE))).toBe(false);
  });
});

describe("the order code", () => {
  it("is suggested exactly as the API suggests it", () => {
    for (const name of ["What's on your pregame playlist?", "Pregame", "The A", "", "Summer of Soccer 2026", "Ñandú Élan", "x"]) {
      expect(suggestOrderCode(name), name).toBe(apiSuggestOrderCode(name));
    }
    expect(suggestOrderCode("What's on your pregame playlist?")).toBe("PPL");
  });
  it("shows the number an order will carry", () => {
    expect(orderNumberPreview("PGM", 2026)).toBe("SX-PGM-2026-0001");
    expect(orderNumberPreview("", 2026)).toBe("SX-___-2026-0001");
  });
  it("money as typed becomes cents", () => {
    expect(dollarsCents("1,500")).toBe(150_000);
    expect(dollarsCents("$150.50")).toBe(15_050);
    expect(dollarsCents("")).toBe(0);
    expect(dollarsCents("1.999")).toBeNull();
    expect(dollarsCents("about 5")).toBeNull();
  });
});

describe("the order laid out like the template", () => {
  const details = (): OrderDetails => orderDetailsOf(ready({ exclusive: true, exclCategory: "Sports drinks", exclDays: "30", nonCash: "" }), CATALOGUE);

  it("says each medium in the API's own words, on every job's defaults", () => {
    for (const jobId of API_JOB_IDS) {
      const job = { jobId, media: defaultMedia(jobId, WINDOW) };
      expect(mediaWords(job), jobId).toBe(apiMediaWords(job));
    }
    expect(mediaWords({ jobId: "SX-03", media: { videos: 1, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "INSTAGRAM" } })).toBe("1 × 15–30 second vertical video for Instagram");
  });
  it("has the template's rows in the template's order", () => {
    const s = orderSheet({ details: details(), orderNumber: "SX-PPL-2026-0001", athlete: "Jordan Avery", sponsor: "Cafe Milo", campaign: "Pregame playlist", compensation: "$250.00" });
    expect(s.head.map((r) => r.label)).toEqual([
      "Order #", "Athlete", "Sponsor", "Campaign", "Job", "Prompt", "Deliverable", "Due / publish window", "Compensation", "Exclusivity", "Disclosure", "Approval", "Payment timing",
    ]);
    const row = (label: string) => s.head.find((r) => r.label === label)?.value;
    expect(row("Job")).toBe("SX-03 Athlete Reel");
    expect(row("Deliverable")).toBe("1 × 15–30 second vertical video for Instagram");
    expect(row("Exclusivity")).toBe("Sports drinks, for 30 days from acceptance, in United States");
    expect(row("Disclosure")).toBe("#ad");
    expect(row("Approval")).toBe("BTG approval required; sponsor approval: no");
    expect(row("Payment timing")).toBe("Within 30 days after every deliverable is verified and the sponsor has paid");
    expect(s.sections.map((x) => x.title)).toEqual(["Content and usage rights", "Paid media", "Exclusivity / conflicts", "Compensation and payment"]);
    expect(s.sections[0].rows.map((r) => r.label)).toEqual(["Authorized channels", "Usage period", "Territory", "Additional rights / restrictions"]);
    expect(s.sections[1].rows).toEqual([{ label: "Paid media", value: "Not included" }]);
    expect(s.sections[2].rows.map((r) => r.label)).toEqual(["Restricted category", "Exclusivity period", "Geographic scope"]);
    expect(s.sections[3].rows.at(-1)).toEqual({ label: "Product / non-cash consideration", value: "None" });
  });
  it("leaves out what it wasn't given: no order number, athlete or pay before there is one", () => {
    const s = orderSheet({ details: details() });
    expect(s.head.map((r) => r.label)).not.toContain("Order #");
    expect(s.head.map((r) => r.label)).not.toContain("Compensation");
    expect(s.sections[3].rows.map((r) => r.label)).toEqual(["Payment timing", "Product / non-cash consideration"]);
  });
  it("gives each job its own block, with every one of its fields", () => {
    for (const jobId of API_JOB_IDS) {
      const rows = mediaRows({ jobId, media: defaultMedia(jobId, WINDOW) }, "UTC");
      expect(rows.length, jobId).toBeGreaterThanOrEqual(2);
      for (const r of rows) expect(r.value, `${jobId} ${r.label}`).not.toMatch(/undefined|NaN/);
    }
    expect(mediaRows({ jobId: "SX-05", media: defaultMedia("SX-05", WINDOW) }, "UTC")[1]).toEqual({ label: "Date and time", value: "Nov 20, 2026, 5:00 PM" });
    expect(mediaRows({ jobId: "SX-07", media: defaultMedia("SX-07", WINDOW) }).at(-1)?.value).toBe("4 × SX-02 Sponsored Post");
  });
  it("says paid media, exclusivity, usage and payment in words", () => {
    expect(paidMediaLine({ included: false })).toBe("Not included");
    expect(paidMediaLine({ included: true, kinds: ["BOOSTED_POSTS"], platforms: ["INSTAGRAM", "SPONSOR_WEBSITE"], durationDays: 30, territory: "United States", extraCompensationCents: 15_000 }))
      .toBe("Boosted posts on Instagram, the sponsor's website, for 30 days, in United States, for $150 more");
    expect(paidMediaLine({ included: true, kinds: ["PRINT"], platforms: [], durationDays: 1, territory: "Maryland", extraCompensationCents: 0 })).toBe("Print, for 1 day, in Maryland, extra pay set by BTG");
    expect(paidMediaLine({ included: true, kinds: ["PRINT"], platforms: [], durationDays: 1, territory: "Maryland" })).toBe("Print, for 1 day, in Maryland");
    expect(exclusivityLine({ included: false })).toBe("None");
    expect(usagePeriodWords(0)).toBe("During the publish window only");
    expect(usagePeriodWords(90)).toBe("During the publish window and for 90 days after it ends");
    expect(paymentWords(0)).toMatch(/^As soon as/);
    expect(approvalWords(true)).toBe("BTG approval required; sponsor approval: yes");
    expect(windowWords({ start: "2026-12-01", end: "2026-12-31" })).toBe("Dec 1, 2026 to Dec 31, 2026");
    expect(windowWords({ start: "2026-12-01", end: "2026-12-01" })).toBe("Dec 1, 2026");
    expect(centsWords(12_550)).toBe("$125.50");
    expect(centsWords(125_000)).toBe("$1,250");
  });
  it("reads what the API sends, and nothing else", () => {
    const api = defaultOrderDetails({ prompt: "Share it", start: new Date("2026-12-01"), end: new Date("2026-12-31"), jobIds: ["SX-03", "SX-01"] });
    expect(OrderDetailsSchema.safeParse(api).success).toBe(true);
    expect(readOrderDetails(api)).toEqual(api);
    expect(readOrderDetails(JSON.parse(JSON.stringify(api)))?.jobs).toHaveLength(2);
    expect(readOrderDetails(null)).toBeNull();
    expect(readOrderDetails({ prompt: "x" })).toBeNull();
    expect(readOrderDetails("SX")).toBeNull();
    /* The athlete's pay hidden from a reader who may not see it: still an order. */
    const { extraCompensationCents: _hidden, ...paid } = { included: true as const, kinds: ["PRINT"], platforms: [], durationDays: 5, territory: "US", extraCompensationCents: 500 };
    const hidden = readOrderDetails({ ...api, paidMedia: paid })!;
    expect(orderSheet({ details: hidden }).sections[1].rows.map((r) => r.label)).toEqual(["What is added", "Platforms", "Duration", "Territory"]);
  });
});

describe("BTG: why an order is held", () => {
  it("takes the order rules' reasons out of a stop or a skip, one per sentence", () => {
    expect(orderHoldReasons("Held for BTG by the order rules: Paid media is included with no extra pay for the athlete: BTG sets the pay before any order goes out.")).toEqual([
      "Paid media is included with no extra pay for the athlete: BTG sets the pay before any order goes out.",
    ]);
    expect(orderHoldReasons("Held for BTG by the order rules: Paid media for a minor: a person at BTG decides with the guardian. Exclusivity for a minor: a person at BTG decides with the guardian.")).toEqual([
      "Paid media for a minor: a person at BTG decides with the guardian.",
      "Exclusivity for a minor: a person at BTG decides with the guardian.",
    ]);
  });
  it("reads the API's own hold sentences back, one by one", () => {
    /* Built the way auto-staffing.ts builds them: the prefix, then the rules' reasons joined by a space. */
    const minor = { birthDate: new Date("2012-05-01"), ageBand: null };
    const d = orderDetailsOf(ready({ paid: true, paidKinds: ["BOOSTED_POSTS"], paidExtra: "0", exclusive: true, exclCategory: "Sports drinks" }), CATALOGUE);
    const api = OrderDetailsSchema.parse(d);
    for (const reasons of [apiCampaignHolds(api, []), apiAthleteHolds(api, minor)]) {
      expect(reasons.length).toBeGreaterThan(0);
      expect(orderHoldReasons(`Held for BTG by the order rules: ${reasons.join(" ")}`)).toEqual(reasons);
    }
    expect(paidMediaNeedsPay(d)).toBe(true);
    expect(paidMediaNeedsPay(orderDetailsOf(ready({ paid: true, paidKinds: ["BOOSTED_POSTS"], paidExtra: "150" }), CATALOGUE))).toBe(false);
  });
  it("leaves every other reason alone", () => {
    expect(orderHoldReasons("Turned off by BTG: the sponsor asked to wait")).toEqual([]);
    expect(orderHoldReasons(null)).toEqual([]);
  });
});

describe("where the builder and the order are wired in", () => {
  const pages = ["app/(app)/sponsor/page.tsx", "app/(app)/sponsor/campaigns/page.tsx", "app/(app)/sponsor/requests/page.tsx"];
  it("every '+ Create a campaign' opens the builder, and no page still says '+ New request'", () => {
    expect(src("components/create-campaign-link.tsx")).toContain('CREATE_CAMPAIGN_HREF = "/sponsor/campaigns/new"');
    for (const p of pages) {
      const s = src(p);
      expect(s, p).toContain("<CreateCampaignButton />");
      expect(s, p).not.toContain("+ New request");
      expect(s, p).not.toContain("Browse packages to start one");
    }
    /* The empty states keep Packages as the second way in. */
    expect(src("components/create-campaign-link.tsx")).toContain("or start from a ready-made package");
    expect(src("app/(app)/sponsor/campaigns/page.tsx")).toContain("<CreateCampaignStart />");
    expect(src("app/(app)/sponsor/requests/page.tsx")).toContain("<CreateCampaignStart />");
  });
  it("lets only a sponsor admin build, on the page and in the action", () => {
    expect(src("app/(focus)/sponsor/campaigns/new/page.tsx")).toMatch(/if \(!actor\.roles\.includes\("SPONSOR_ADMIN"\)\)/);
    const actions = src("app/(focus)/sponsor/campaigns/new/actions.ts");
    expect(actions).toMatch(/if \(!who\.actor\.roles\.includes\("SPONSOR_ADMIN"\)\)/);
    /* A "use server" file exports only async functions (a constant breaks every action in it). */
    expect(actions.match(/^export (?!async function|type )/gm)).toBeNull();
  });
  it("shows the whole order to the athlete before they accept, and to BTG on the campaign", () => {
    for (const p of ["app/(app)/athlete/orders/[id]/page.tsx", "app/(app)/athlete/offers/[id]/page.tsx", "app/(app)/admin/campaigns/[id]/page.tsx"]) {
      const s = src(p);
      expect(s, p).toContain("readOrderDetails(");
      expect(s, p).toContain("<OrderSheet");
    }
    expect(src("app/(app)/admin/campaigns/[id]/page.tsx")).toContain("orderHoldReasons(");
  });
});

describe("the rail", () => {
  it("puts a few words under each finished step", () => {
    const d = ready({ states: ["MD"], sports: ["Soccer"], category: "RESTAURANT", paid: true });
    expect(stepAnswer("campaign", d)).toBe("What's on your pregame playlist?");
    expect(stepAnswer("budget", d)).toBe("$2,500");
    expect(stepAnswer("reach", d)).toBe("United States · 1 state · Soccer");
    expect(stepAnswer("safety", d)).toBe("Restaurant");
    expect(stepAnswer("jobs", d)).toBe("Athlete Reel");
    expect(stepAnswer("usage", d)).toBe("Paid media added");
    expect(stepAnswer("terms", d)).toBe("Not exclusive");
    expect(stepAnswer("review", d)).toBe("");
  });
});

function addDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
