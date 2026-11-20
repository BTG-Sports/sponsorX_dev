/* --------------------------------------------------------------------------
   The sponsor's campaign builder — POL-FE-107 and POL-FE-116
   (polish.md §107, §116), at /sponsor/campaigns/new.

   One builder for both items. §107 asks for a campaign of the sponsor's own
   (goal, budget, dates, country, states for the United States only, sports,
   audience, channels, brand safety), sent to POST /briefs with NO package.
   §116 asks that the same page builds every athlete's order: every field of
   the Athlete Campaign Order template, with the deliverable section changing
   by each chosen job's medium. So the steps run:

     campaign → budget and dates → who to reach → brand safety     (§107)
     → jobs → deliverables → usage and paid media → terms          (§116)
     → review and send

   and the one request carries both: the brief's own columns, plus
   `orderDetails` and `orderCode`.

   Pure, so the exact body the page sends is testable on its own — the test
   parses this file's output with the API's real CampaignBriefInput, so a
   drift between the two fails a build rather than a sponsor's campaign.

   What each medium asks for comes from GET /campaign-builder/catalogue (the
   fields, their choices and limits, and what a job starts from); this file
   holds the words for them and turns what was typed into what the API takes.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "./brand-categories";
import {
  AUDIENCE_TIERS,
  MATCH_CHANNELS,
  MIN_CAMPAIGN_DAYS,
  STATE_NAMES,
  briefToday,
  followersCount,
  objectiveProblem,
  type AudienceTier,
  type MatchChannel,
} from "./brief-request";
import { addDays, parseDay } from "./day-range";
import { JOB_IDS, JOB_NAME, isJobId, type JobId, type OrderDetails, type OrderJob } from "./order-details";

/* ── the catalogue (GET /campaign-builder/catalogue) ─────────────────────── */

export type BuilderFieldKind = "integer" | "number" | "choice" | "text" | "text?" | "boolean" | "date" | "datetime" | "list";
export type BuilderField = { field: string; kind: string; choices?: readonly string[]; min?: number; max?: number };
export type BuilderJob = { jobId: string; name: string; fields: BuilderField[]; defaults: Record<string, unknown> };
export type BuilderCatalogue = {
  jobs: BuilderJob[];
  channels: readonly string[];
  platforms: readonly string[];
  paidMediaKinds: readonly string[];
  defaults: { usagePeriodDays: number; paymentDaysAfterVerified: number; disclosures: string[]; territory: string; sponsorApproval: boolean };
  limits: { usagePeriodDays: number; exclusivityDays: number; paymentDaysAfterVerified: number };
};

export function isCatalogue(v: unknown): v is BuilderCatalogue {
  const c = v as Partial<BuilderCatalogue> | null;
  return (
    !!c &&
    Array.isArray(c.jobs) &&
    c.jobs.length > 0 &&
    c.jobs.every((j) => j && typeof j.jobId === "string" && Array.isArray(j.fields) && !!j.defaults) &&
    Array.isArray(c.channels) &&
    Array.isArray(c.platforms) &&
    Array.isArray(c.paidMediaKinds) &&
    typeof c.defaults?.usagePeriodDays === "number" &&
    typeof c.defaults?.paymentDaysAfterVerified === "number" &&
    Array.isArray(c.defaults?.disclosures) &&
    typeof c.limits?.usagePeriodDays === "number" &&
    typeof c.limits?.exclusivityDays === "number" &&
    typeof c.limits?.paymentDaysAfterVerified === "number"
  );
}

/** GET /catalogue/targeting — what live athletes cover (POL-BE-107 added the countries). */
export type BuilderTargeting = { sports: string[]; stateCodes: string[]; countryCodes: string[] };

/* ── countries ───────────────────────────────────────────────────────────── */

export const HOME_COUNTRY = "US";

/** "US" → "United States"; a code with no name stays as it is. */
export function countryName(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

/** The Country list: the United States first, then the other countries athletes are in, A to Z. */
export function countryOptions(codes: readonly string[]): { value: string; label: string }[] {
  const rest = [...new Set(codes.map((c) => c.trim().toUpperCase()))]
    .filter((c) => /^[A-Z]{2}$/.test(c) && c !== HOME_COUNTRY)
    .map((c) => ({ value: c, label: countryName(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: HOME_COUNTRY, label: countryName(HOME_COUNTRY) }, ...rest];
}

/** States are a United States question only (the API refuses them anywhere else, 400). */
export const asksStates = (country: string) => country === HOME_COUNTRY;

export function stateOptions(codes: readonly string[]): { value: string; label: string }[] {
  const known = [...new Set(codes)].filter((c) => c in STATE_NAMES);
  return (known.length ? known : Object.keys(STATE_NAMES))
    .map((c) => ({ value: c, label: STATE_NAMES[c] }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const CATEGORY_CHOICES: { value: BrandCategory; label: string }[] = BRAND_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })).sort((a, b) =>
  a.label.localeCompare(b.label),
);

/* ── the draft: what the sponsor has typed so far ────────────────────────── */

/** A medium as typed: numbers and dates as text, a yes/no as a boolean. A monthly mix is `mix:SX-02` → "4". */
export type MediaDraft = Record<string, string | boolean>;

export type BuilderDraft = {
  /* campaign */
  name: string;
  goal: string;
  /* budget and dates */
  budget: string;
  start: string;
  end: string;
  /* who to reach */
  country: string;
  states: string[];
  sports: string[];
  tiers: string[];
  minFollowers: string;
  channels: string[];
  /* brand safety */
  category: string;
  avoid: string[];
  /* jobs */
  prompt: string;
  jobs: string[];
  media: Record<string, MediaDraft>;
  /* deliverables */
  windowStart: string;
  windowEnd: string;
  disclosures: string[];
  /* usage and paid media */
  usageChannels: string[];
  usageDays: string;
  territory: string;
  restrictions: string;
  paid: boolean;
  paidKinds: string[];
  paidPlatforms: string[];
  paidDays: string;
  paidTerritory: string;
  paidExtra: string;
  /* exclusivity, approval and payment */
  exclusive: boolean;
  exclCategory: string;
  exclDays: string;
  exclScope: string;
  sponsorApproval: boolean;
  paymentDays: string;
  nonCash: string;
  orderCode: string;
};

const DEFAULT_WEEKS = 4;

/** A blank campaign: starts in two weeks, runs four, in the United States, on BTG's standard terms. */
export function blankDraft(catalogue: BuilderCatalogue, now = new Date()): BuilderDraft {
  const start = addDays(briefToday(now), 14);
  const end = addDays(start, DEFAULT_WEEKS * 7);
  const home = countryName(HOME_COUNTRY);
  return {
    name: "",
    goal: "",
    budget: "",
    start,
    end,
    country: HOME_COUNTRY,
    states: [],
    sports: [],
    tiers: [],
    minFollowers: "",
    channels: [],
    category: "",
    avoid: [],
    prompt: "",
    jobs: [],
    media: {},
    windowStart: start,
    windowEnd: end,
    disclosures: catalogue.defaults.disclosures.length ? [...catalogue.defaults.disclosures] : ["#ad"],
    usageChannels: ["INSTAGRAM"].filter((c) => catalogue.channels.includes(c)),
    usageDays: String(catalogue.defaults.usagePeriodDays),
    territory: home,
    restrictions: "",
    paid: false,
    paidKinds: [],
    paidPlatforms: [],
    paidDays: "30",
    paidTerritory: home,
    paidExtra: "",
    exclusive: false,
    exclCategory: "",
    exclDays: "30",
    exclScope: home,
    sponsorApproval: catalogue.defaults.sponsorApproval,
    paymentDays: String(catalogue.defaults.paymentDaysAfterVerified),
    nonCash: "",
    orderCode: "",
  };
}

/* The draft is kept on this device as it is typed, so a refresh in the middle
   of nine steps loses nothing. What comes back is read over a blank draft:
   only fields a draft has, in the type they have, and only jobs the
   catalogue still lists. */
export const BUILDER_DRAFT_KEY = "sx-campaign-builder-v1";

export function storeDraft(draft: BuilderDraft, step: number): string {
  return JSON.stringify({ v: 1, step, draft });
}

export function parseStoredDraft(raw: string | null | undefined, catalogue: BuilderCatalogue, now = new Date()): { draft: BuilderDraft; step: number } | null {
  if (!raw) return null;
  let stored: { v?: unknown; step?: unknown; draft?: unknown };
  try {
    stored = JSON.parse(raw) as typeof stored;
  } catch {
    return null;
  }
  if (!stored || stored.v !== 1 || !stored.draft || typeof stored.draft !== "object") return null;
  const blank = blankDraft(catalogue, now);
  const from = stored.draft as Record<string, unknown>;
  const draft = { ...blank } as Record<string, unknown>;
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const [k, base] of Object.entries(blank)) {
    const v = from[k];
    if (Array.isArray(base) ? strings(v) : typeof base === typeof v && v !== null && !Array.isArray(v)) draft[k] = v;
  }
  const known = new Set(catalogue.jobs.map((j) => j.jobId));
  const next = draft as BuilderDraft;
  next.jobs = next.jobs.filter((j) => known.has(j));
  const media: Record<string, MediaDraft> = {};
  for (const [jobId, m] of Object.entries(next.media ?? {})) {
    if (!known.has(jobId) || !m || typeof m !== "object") continue;
    media[jobId] = Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "string" || typeof v === "boolean")) as MediaDraft;
  }
  /* A job that is picked always has its medium. */
  for (const job of catalogue.jobs) if (next.jobs.includes(job.jobId) && !media[job.jobId]) media[job.jobId] = mediaDraftFor(job, next.start);
  next.media = media;
  const step = typeof stored.step === "number" && Number.isInteger(stored.step) ? Math.min(Math.max(stored.step, 0), BUILDER_STEPS.length - 1) : 0;
  return { draft: next, step };
}

/** A different country: states go when it isn't the United States, and a territory still naming the old country follows. */
export function withCountry(d: BuilderDraft, country: string): BuilderDraft {
  const was = countryName(d.country);
  const now = countryName(country);
  const follow = (v: string) => (v.trim() === "" || v === was ? now : v);
  return {
    ...d,
    country,
    states: asksStates(country) ? d.states : [],
    territory: follow(d.territory),
    paidTerritory: follow(d.paidTerritory),
    exclScope: follow(d.exclScope),
  };
}

/** New campaign dates: a publish window that was the whole campaign stays the whole campaign, and a job's date that was the first day follows it. */
export function withDates(d: BuilderDraft, start: string, end: string): BuilderDraft {
  const whole = (d.windowStart === d.start || !d.windowStart) && (d.windowEnd === d.end || !d.windowEnd);
  const media: Record<string, MediaDraft> = {};
  for (const [jobId, m] of Object.entries(d.media)) {
    const next = { ...m };
    if (start && d.start) {
      if (next.shootDate === d.start) next.shootDate = start;
      if (typeof next.startsAt === "string" && next.startsAt.slice(0, 10) === d.start) next.startsAt = `${start}${next.startsAt.slice(10)}`;
    }
    media[jobId] = next;
  }
  return { ...d, start, end, media, ...(whole ? { windowStart: start, windowEnd: end } : {}) };
}

const toText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** What a job's medium starts from: the catalogue's defaults, with its dates on the campaign's first day. */
export function mediaDraftFor(job: BuilderJob, start: string): MediaDraft {
  const out: MediaDraft = {};
  for (const f of job.fields) {
    const v = job.defaults[f.field];
    if (f.kind === "boolean") out[f.field] = v === true;
    else if (f.kind === "date") out[f.field] = start || toText(v).slice(0, 10);
    else if (f.kind === "datetime") out[f.field] = `${start || toText(v).slice(0, 10)}T17:00`;
    else if (f.kind === "list") {
      for (const x of Array.isArray(v) ? (v as Array<{ jobId: string; quantity: number }>) : []) out[`mix:${x.jobId}`] = String(x.quantity);
    } else out[f.field] = toText(v);
  }
  return out;
}

/** Pick or drop a job. A job picked again keeps what was typed for it. */
export function toggleJob(d: BuilderDraft, jobId: string, catalogue: BuilderCatalogue): BuilderDraft {
  if (d.jobs.includes(jobId)) return { ...d, jobs: d.jobs.filter((j) => j !== jobId) };
  const job = catalogue.jobs.find((j) => j.jobId === jobId);
  if (!job) return d;
  const order = catalogue.jobs.map((j) => j.jobId);
  return {
    ...d,
    jobs: [...d.jobs, jobId].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    media: d.media[jobId] ? d.media : { ...d.media, [jobId]: mediaDraftFor(job, d.start) },
  };
}

/* ── words for each medium's fields ──────────────────────────────────────── */

type FieldWords = { label: string; hint?: string; unit?: string };
const MEDIA_WORDS: Record<string, Record<string, FieldWords>> = {
  "SX-01": {
    frames: { label: "Story frames", unit: "frames" },
    platform: { label: "Platform" },
    link: { label: "Link on the story" },
    hoursLive: { label: "How long it stays up", unit: "hours" },
  },
  "SX-02": {
    format: { label: "Kind of post" },
    images: { label: "Images", hint: "One for a single image; up to ten in a carousel.", unit: "images" },
    platform: { label: "Platform" },
    caption: { label: "Caption", hint: "Leave it blank and the athlete writes their own." },
    daysLive: { label: "How long it stays up", unit: "days" },
  },
  "SX-03": {
    videos: { label: "Videos", unit: "videos" },
    minSeconds: { label: "Shortest length", unit: "seconds" },
    maxSeconds: { label: "Longest length", unit: "seconds" },
    orientation: { label: "Format" },
    platform: { label: "Platform" },
  },
  "SX-04": {
    product: { label: "The product" },
    contentFormat: { label: "What the athlete makes about it" },
    productKept: { label: "The athlete keeps the product" },
  },
  "SX-05": {
    event: { label: "Event" },
    startsAt: { label: "Date and time", hint: "In your own time zone." },
    place: { label: "Place" },
    hoursOnSite: { label: "Time on site", unit: "hours" },
    activities: { label: "What the athlete does there" },
    filmedBy: { label: "Who films" },
  },
  "SX-06": {
    shootDate: { label: "Shoot date" },
    place: { label: "Place" },
    hours: { label: "Length of the shoot", unit: "hours" },
    finishedPieces: { label: "Finished pieces", unit: "pieces" },
    filmedBy: { label: "Who films" },
    rawFootageIncluded: { label: "Raw footage is included" },
  },
  "SX-07": {
    months: { label: "Months", unit: "months" },
    monthlyMix: { label: "Each month", hint: "How many of each job the athlete does every month. Leave a job at 0 to leave it out." },
  },
};
const humanise = (field: string) => {
  const t = field.replace(/([A-Z])/g, " $1").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** The words for a medium's field; a field this file doesn't know yet is shown by its own name. */
export function fieldWords(jobId: string, field: string): FieldWords {
  return MEDIA_WORDS[jobId]?.[field] ?? { label: humanise(field) };
}

/** What a job is, in a line, on its card. */
export const JOB_HINT: Record<JobId, string> = {
  "SX-01": "A short story that disappears after a day or two.",
  "SX-02": "A photo or carousel that stays on the athlete's page.",
  "SX-03": "A short video in the athlete's own voice.",
  "SX-04": "The athlete tries your product and shows it.",
  "SX-05": "The athlete comes to your event or store.",
  "SX-06": "A shoot day that gives you several finished pieces.",
  "SX-07": "The athlete represents you every month.",
};
export const jobName = (job: { jobId: string; name?: string }) => job.name || (isJobId(job.jobId) ? JOB_NAME[job.jobId] : job.jobId);

/* ── what was typed → what the API takes ─────────────────────────────────── */

type Problems = Record<string, string>;

function wholeNumber(text: string, min: number, max: number, what: string, unit = ""): { ok: true; n: number } | { ok: false; problem: string } {
  const t = text.trim().replace(/,/g, "");
  const range = `${what} is a whole number from ${min} to ${max}${unit ? ` ${unit}` : ""}.`;
  if (!/^\d+$/.test(t)) return { ok: false, problem: t ? range : `${what}: enter a number.` };
  const n = Number(t);
  return n < min || n > max ? { ok: false, problem: range } : { ok: true, n };
}
function anyNumber(text: string, min: number, max: number, what: string, unit = ""): { ok: true; n: number } | { ok: false; problem: string } {
  const t = text.trim();
  const range = `${what} is a number from ${min} to ${max}${unit ? ` ${unit}` : ""}.`;
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, problem: t ? range : `${what}: enter a number.` };
  const n = Number(t);
  return n < min || n > max ? { ok: false, problem: range } : { ok: true, n };
}

/** A date-and-time field's value ("2026-12-01T17:00", the viewer's own time) as the moment the API stores. */
export function momentOf(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The mix jobs a monthly ambassador may do, in the catalogue's order. */
export function mixJobs(job: BuilderJob): string[] {
  const f = job.fields.find((x) => x.kind === "list");
  return [...(f?.choices ?? JOB_IDS.filter((j) => j !== "SX-07"))];
}

/** One job's medium, checked field by field. Problems are keyed `media.<job>.<field>`. */
export function mediaOf(job: BuilderJob, typed: MediaDraft | undefined): { media: Record<string, unknown>; problems: Problems } {
  const m = typed ?? {};
  const media: Record<string, unknown> = {};
  const problems: Problems = {};
  const key = (field: string) => `media.${job.jobId}.${field}`;
  for (const f of job.fields) {
    const w = fieldWords(job.jobId, f.field);
    const raw = m[f.field];
    const text = typeof raw === "string" ? raw : "";
    switch (f.kind) {
      case "integer": {
        const r = wholeNumber(text, f.min ?? 0, f.max ?? 2_147_483_647, w.label, w.unit);
        if (r.ok) media[f.field] = r.n;
        else problems[key(f.field)] = r.problem;
        break;
      }
      case "number": {
        const r = anyNumber(text, f.min ?? 0, f.max ?? 2_147_483_647, w.label, w.unit);
        if (r.ok) media[f.field] = r.n;
        else problems[key(f.field)] = r.problem;
        break;
      }
      case "choice":
        if ((f.choices ?? []).includes(text)) media[f.field] = text;
        else problems[key(f.field)] = `${w.label}: pick one.`;
        break;
      case "text": {
        const t = text.trim();
        if (!t) problems[key(f.field)] = `${w.label}: say what it is.`;
        else if (f.max && t.length > f.max) problems[key(f.field)] = `${w.label} is at most ${f.max} characters.`;
        else media[f.field] = t;
        break;
      }
      case "text?": {
        const t = text.trim();
        if (f.max && t.length > f.max) problems[key(f.field)] = `${w.label} is at most ${f.max} characters.`;
        else media[f.field] = t || null;
        break;
      }
      case "boolean":
        media[f.field] = raw === true;
        break;
      case "date":
        if (parseDay(text)) media[f.field] = text;
        else problems[key(f.field)] = `${w.label}: pick a date.`;
        break;
      case "datetime": {
        const at = momentOf(text);
        if (at) media[f.field] = at;
        else problems[key(f.field)] = `${w.label}: pick a date and a time.`;
        break;
      }
      case "list": {
        const mix: Array<{ jobId: string; quantity: number }> = [];
        for (const id of mixJobs(job)) {
          const q = String(m[`mix:${id}`] ?? "").trim();
          if (!q || q === "0") continue;
          const r = wholeNumber(q, 1, 10, isJobId(id) ? JOB_NAME[id] : id, "a month");
          if (r.ok) mix.push({ jobId: id, quantity: r.n });
          else problems[key(f.field)] = r.problem;
        }
        if (!mix.length && !problems[key(f.field)]) problems[key(f.field)] = "Pick at least one job the athlete does each month.";
        media[f.field] = mix;
        break;
      }
      default:
        /* A kind added to the catalogue after this file: sent as typed, and the API says if it is wrong. */
        media[f.field] = typeof raw === "boolean" ? raw : text.trim();
    }
  }
  /* The reel's own rule (order-details-rules.ts): the longest length is at least the shortest. */
  if (typeof media.minSeconds === "number" && typeof media.maxSeconds === "number" && media.maxSeconds < media.minSeconds) {
    problems[key("maxSeconds")] = "The longest length is at least the shortest.";
  }
  /* A single image is one image; a carousel is at least two. */
  if (media.format === "CAROUSEL" && typeof media.images === "number" && media.images < 2) problems[key("images")] = "A carousel has at least two images.";
  return { media, problems };
}

/* ── the steps ───────────────────────────────────────────────────────────── */

export const BUILDER_STEPS = [
  { id: "campaign", label: "Campaign", heading: "What is this campaign?", sub: "Give it a name and say what it should achieve. BTG and the athletes you're matched with read this first." },
  { id: "budget", label: "Budget and dates", heading: "How much, and when?", sub: "Your budget for the whole campaign, and the days it runs. Nothing is charged now." },
  { id: "reach", label: "Who to reach", heading: "Who should it reach?", sub: "Only athletes in the country you pick are matched. Leave the rest open and BTG looks across everyone who fits." },
  { id: "safety", label: "Brand safety", heading: "What should your brand stay clear of?", sub: "Your own category, and any you don't want to be seen beside. An athlete tied to one you avoid is never matched." },
  { id: "jobs", label: "What athletes do", heading: "What will each athlete do?", sub: "Write the prompt the athletes answer, then pick the jobs. Each job you pick becomes its own order." },
  { id: "deliverables", label: "Deliverables", heading: "What exactly will they deliver?", sub: "The details of each job you picked, when it is published and how it is disclosed." },
  { id: "usage", label: "Usage and paid media", heading: "Where may the content be used?", sub: "The athlete keeps ownership. You may use what they make only as you set out here." },
  { id: "terms", label: "Exclusivity and payment", heading: "The last terms of the order", sub: "Exclusivity, who approves each post, when the athlete is paid, and the number on each order." },
  { id: "review", label: "Review", heading: "Check the order, then send it", sub: "This is the order each athlete reads before accepting. Change anything that isn't right." },
] as const;
export type BuilderStepId = (typeof BUILDER_STEPS)[number]["id"];

export type BuilderContext = { catalogue: BuilderCatalogue; countries: readonly string[]; now?: Date };

export const ORDER_CODE = /^[A-Z]{3}$/;
export const MAX_DISCLOSURES = 10;
const TEXT = { name: 80, prompt: 1000, territory: 120, restrictions: 1000, exclCategory: 120, nonCash: 500, disclosure: 60 };

/** A dollar amount as typed, in cents; "" is nothing. Null when it isn't an amount. */
export function dollarsCents(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, "");
  if (!t) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

const jobsOf = (d: BuilderDraft, c: BuilderCatalogue) => c.jobs.filter((j) => d.jobs.includes(j.jobId));

/** What is wrong on one step, keyed by the field it belongs to; {} when the step is ready. */
export function stepProblems(id: BuilderStepId, d: BuilderDraft, ctx: BuilderContext): Problems {
  const p: Problems = {};
  const { catalogue } = ctx;
  const now = ctx.now ?? new Date();
  switch (id) {
    case "campaign": {
      const name = d.name.trim();
      if (name.length < 2) p.name = "Give the campaign a name.";
      else if (name.length > TEXT.name) p.name = `A name is at most ${TEXT.name} characters.`;
      const goal = objectiveProblem(d.goal);
      if (goal) p.goal = goal;
      break;
    }
    case "budget": {
      const cents = dollarsCents(d.budget);
      if (!d.budget.trim()) p.budget = "Enter your budget in dollars, e.g. 1500.";
      else if (cents === null || cents <= 0) p.budget = "Enter your budget as an amount in dollars, e.g. 1500.";
      else if (cents > 2_147_483_647) p.budget = "That budget is larger than SponsorX can hold.";
      if (!parseDay(d.start)) p.start = "Pick the day the campaign starts.";
      else if (d.start <= briefToday(now)) p.start = "The start date must be after today.";
      if (!parseDay(d.end)) p.end = "Pick the day the campaign ends.";
      else if (parseDay(d.start) && d.end < addDays(d.start, MIN_CAMPAIGN_DAYS)) p.end = `A campaign runs at least ${MIN_CAMPAIGN_DAYS} days: move the end date later.`;
      break;
    }
    case "reach": {
      if (!/^[A-Z]{2}$/.test(d.country)) p.country = "Pick a country.";
      else if (!countryOptions(ctx.countries).some((o) => o.value === d.country)) p.country = "No athlete is in that country yet. Pick another.";
      if (d.states.length && !asksStates(d.country)) p.states = "States are only for the United States.";
      try {
        followersCount(d.minFollowers);
      } catch (e) {
        p.minFollowers = e instanceof Error ? e.message : "Give the minimum audience as a number of followers.";
      }
      break;
    }
    case "safety":
      if (d.category && !(BRAND_CATEGORIES as readonly string[]).includes(d.category)) p.category = "Pick your category from the list.";
      if (d.category && d.avoid.includes(d.category)) p.avoid = "Your own category can't also be one to avoid.";
      break;
    case "jobs": {
      const prompt = d.prompt.trim();
      if (!prompt) p.prompt = "Write the prompt the athletes answer.";
      else if (prompt.length > TEXT.prompt) p.prompt = `A prompt is at most ${TEXT.prompt} characters.`;
      if (!jobsOf(d, catalogue).length) p.jobs = "Pick at least one job.";
      break;
    }
    case "deliverables": {
      for (const job of jobsOf(d, catalogue)) Object.assign(p, mediaOf(job, d.media[job.jobId]).problems);
      if (!parseDay(d.windowStart)) p.windowStart = "Pick the first day content may be published.";
      if (!parseDay(d.windowEnd)) p.windowEnd = "Pick the last day content may be published.";
      if (!p.windowStart && !p.windowEnd) {
        if (d.windowEnd < d.windowStart) p.windowEnd = "The publish window ends on or after it starts.";
        else if (d.windowStart < d.start || d.windowEnd > d.end) p.windowStart = "The publish window has to sit inside the campaign's dates.";
      }
      const tags = d.disclosures.map((t) => t.trim()).filter(Boolean);
      if (!tags.length) p.disclosures = "Pick at least one disclosure. The law asks for paid posts to say so.";
      else if (tags.length > MAX_DISCLOSURES) p.disclosures = `At most ${MAX_DISCLOSURES} disclosures.`;
      else if (tags.some((t) => t.length > TEXT.disclosure)) p.disclosures = `A disclosure is at most ${TEXT.disclosure} characters.`;
      break;
    }
    case "usage": {
      if (!d.usageChannels.some((c) => catalogue.channels.includes(c))) p.usageChannels = "Pick at least one channel the content may be used on.";
      const days = wholeNumber(d.usageDays, 0, catalogue.limits.usagePeriodDays, "The usage period", "days");
      if (!days.ok) p.usageDays = days.problem;
      if (!d.territory.trim()) p.territory = "Say where the content may be used.";
      else if (d.territory.trim().length > TEXT.territory) p.territory = `A territory is at most ${TEXT.territory} characters.`;
      if (d.restrictions.trim().length > TEXT.restrictions) p.restrictions = `Restrictions are at most ${TEXT.restrictions} characters.`;
      if (d.paid) {
        if (!d.paidKinds.some((k) => catalogue.paidMediaKinds.includes(k))) p.paidKinds = "Pick what kind of paid media is added.";
        const pd = wholeNumber(d.paidDays, 1, 730, "The paid media period", "days");
        if (!pd.ok) p.paidDays = pd.problem;
        if (!d.paidTerritory.trim()) p.paidTerritory = "Say where the paid media runs.";
        else if (d.paidTerritory.trim().length > TEXT.territory) p.paidTerritory = `A territory is at most ${TEXT.territory} characters.`;
        const extra = dollarsCents(d.paidExtra);
        if (extra === null || extra > 100_000_000) p.paidExtra = "Enter the extra pay as an amount in dollars, e.g. 150.";
      }
      break;
    }
    case "terms": {
      if (d.exclusive) {
        if (!d.exclCategory.trim()) p.exclCategory = "Say which category the athlete stays out of.";
        else if (d.exclCategory.trim().length > TEXT.exclCategory) p.exclCategory = `A category is at most ${TEXT.exclCategory} characters.`;
        const days = wholeNumber(d.exclDays, 1, catalogue.limits.exclusivityDays, "The exclusivity period", "days");
        if (!days.ok) p.exclDays = days.problem;
        if (!d.exclScope.trim()) p.exclScope = "Say where the exclusivity applies.";
        else if (d.exclScope.trim().length > TEXT.territory) p.exclScope = `An area is at most ${TEXT.territory} characters.`;
      }
      const pay = wholeNumber(d.paymentDays, 0, catalogue.limits.paymentDaysAfterVerified, "Payment timing", "days");
      if (!pay.ok) p.paymentDays = pay.problem;
      if (d.nonCash.trim().length > TEXT.nonCash) p.nonCash = `This is at most ${TEXT.nonCash} characters.`;
      if (d.orderCode.trim() && !ORDER_CODE.test(d.orderCode.trim().toUpperCase())) p.orderCode = "The order code is three letters.";
      break;
    }
    case "review":
      break;
  }
  return p;
}

/** The first step with something wrong on it, or null when the whole campaign is ready to send. */
export function firstProblemStep(d: BuilderDraft, ctx: BuilderContext): { step: number; problems: Problems } | null {
  for (let i = 0; i < BUILDER_STEPS.length; i += 1) {
    const problems = stepProblems(BUILDER_STEPS[i].id, d, ctx);
    if (Object.keys(problems).length) return { step: i, problems };
  }
  return null;
}

/* ── the order details, and the request ──────────────────────────────────── */

const inList = <T extends string>(all: readonly T[], picked: readonly string[]): T[] => all.filter((v) => picked.includes(v));
const tidy = (xs: readonly string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * The order's details from the draft — what the summary shows and what is
 * sent. Built even from an unfinished draft (the summary is on screen before
 * everything is checked); `stepProblems` says what is still wrong.
 */
export function orderDetailsOf(d: BuilderDraft, catalogue: BuilderCatalogue): OrderDetails {
  const num = (text: string, fallback: number) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : fallback);
  const jobs: OrderJob[] = jobsOf(d, catalogue).map((job) => ({ jobId: job.jobId, media: mediaOf(job, d.media[job.jobId]).media }));
  return {
    version: 1,
    prompt: d.prompt.trim(),
    publishWindow: { start: d.windowStart, end: d.windowEnd },
    jobs,
    usage: {
      channels: inList(catalogue.channels, d.usageChannels),
      periodDays: num(d.usageDays, catalogue.defaults.usagePeriodDays),
      territory: d.territory.trim(),
      restrictions: d.restrictions.trim() || null,
    },
    paidMedia: d.paid
      ? {
          included: true,
          kinds: inList(catalogue.paidMediaKinds, d.paidKinds),
          platforms: inList(catalogue.channels, d.paidPlatforms),
          durationDays: num(d.paidDays, 30),
          territory: d.paidTerritory.trim(),
          extraCompensationCents: dollarsCents(d.paidExtra) ?? 0,
        }
      : { included: false },
    exclusivity: d.exclusive ? { included: true, category: d.exclCategory.trim(), days: num(d.exclDays, 30), scope: d.exclScope.trim() } : { included: false },
    disclosures: tidy(d.disclosures),
    sponsorApproval: d.sponsorApproval,
    paymentTiming: { daysAfterVerified: num(d.paymentDays, catalogue.defaults.paymentDaysAfterVerified) },
    nonCash: d.nonCash.trim() || null,
  };
}

/** POST /briefs — a campaign of the sponsor's own: never a package. */
export type CampaignBody = {
  sponsorId: string;
  objective: string;
  budget: number;
  packageId: null;
  startDate: string;
  endDate: string;
  sports: string[];
  countryCode: string;
  stateCodes: string[];
  categories: BrandCategory[];
  excludedCategories: BrandCategory[];
  channels: MatchChannel[];
  audienceTiers: AudienceTier[];
  audienceMinFollowers: number | null;
  orderDetails: OrderDetails;
  orderCode: string | null;
};

export type BuiltCampaign = { ok: true; body: CampaignBody } | { ok: false; step: number; problems: Problems };

/**
 * The whole request, or the first step that still has something wrong. The
 * brief has no column for a campaign's name, so it travels on the objective's
 * second line, where BTG reads it; the order code is made from it.
 */
export function buildCampaign(d: BuilderDraft, sponsorId: string, ctx: BuilderContext): BuiltCampaign {
  const wrong = firstProblemStep(d, ctx);
  if (wrong) return { ok: false, ...wrong };
  const code = d.orderCode.trim().toUpperCase();
  return {
    ok: true,
    body: {
      sponsorId,
      objective: `${d.goal.trim()}\n\nCampaign name: ${d.name.trim()}`.slice(0, 2000),
      budget: dollarsCents(d.budget) ?? 0,
      packageId: null,
      startDate: d.start,
      endDate: d.end,
      sports: tidy(d.sports).slice(0, 20),
      countryCode: d.country,
      /* States only with the United States (POL-BE-107 refuses them anywhere else). */
      stateCodes: asksStates(d.country) ? tidy(d.states).filter((s) => s in STATE_NAMES) : [],
      categories: inList(BRAND_CATEGORIES, d.category ? [d.category] : []),
      excludedCategories: inList(BRAND_CATEGORIES, d.avoid),
      channels: inList(MATCH_CHANNELS, d.channels),
      audienceTiers: inList(AUDIENCE_TIERS, d.tiers),
      audienceMinFollowers: followersCount(d.minFollowers),
      orderDetails: orderDetailsOf(d, ctx.catalogue),
      orderCode: ORDER_CODE.test(code) ? code : null,
    },
  };
}

/* ── the order code ──────────────────────────────────────────────────────── */

const STOP = new Set(["the", "a", "an", "of", "and", "or", "for", "to", "on", "in", "at", "your", "my", "our", "with", "whats", "what", "is", "it", "its", "by", "x"]);

/**
 * Three letters from the campaign's name — the API's own rule
 * (order-details-rules.ts suggestOrderCode), shown while the name is typed.
 * GET /campaign-builder/order-code is asked too; this is what is on screen
 * until it answers, and if it can't.
 */
export function suggestOrderCode(name: string): string {
  const words = name.normalize("NFKD").replace(/[^A-Za-z\s]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "SPX";
  const kept = words.filter((w) => !STOP.has(w));
  const use = kept.length ? kept : words;
  let code = use.map((w) => w[0]).join("").slice(0, 3);
  const tail = (use[use.length - 1] ?? "sponsorx").slice(1);
  for (const ch of tail) {
    if (code.length >= 3) break;
    code += ch;
  }
  return (code + "XXX").slice(0, 3).toUpperCase();
}

/** "SX-PGM-2026-0001" as it will read; the last part is given when an athlete accepts. */
export function orderNumberPreview(code: string, year: number): string {
  return `SX-${ORDER_CODE.test(code) ? code : "___"}-${year}-0001`;
}

/* ── the rail: a few words under each finished step ──────────────────────── */

export function stepAnswer(id: BuilderStepId, d: BuilderDraft): string {
  switch (id) {
    case "campaign":
      return d.name.trim();
    case "budget": {
      const cents = dollarsCents(d.budget);
      return cents ? `$${(cents / 100).toLocaleString("en-US")}` : "";
    }
    case "reach":
      return [countryName(d.country), d.states.length ? `${d.states.length} state${d.states.length === 1 ? "" : "s"}` : "", d.sports.join(", ")].filter(Boolean).join(" · ");
    case "safety":
      return d.category && (BRAND_CATEGORIES as readonly string[]).includes(d.category) ? categoryLabel(d.category as BrandCategory) : d.avoid.length ? `${d.avoid.length} to avoid` : "";
    case "jobs":
      return d.jobs.map((j) => (isJobId(j) ? JOB_NAME[j] : j)).join(", ");
    case "deliverables":
      return d.disclosures.join(" / ");
    case "usage":
      return d.paid ? "Paid media added" : "No paid media";
    case "terms":
      return d.exclusive ? "Exclusive" : "Not exclusive";
    default:
      return "";
  }
}
