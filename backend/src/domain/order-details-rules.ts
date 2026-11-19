/**
 * POL-BE-116 — an athlete's order details, as the Athlete Campaign Order
 * template lays them out (documentation/AthleteCampaignReference/
 * BTG_SponsorX_Athlete_Campaign_Order.docx). Pure: no database, no clock.
 *
 * THE TEMPLATE IS THE BASE FOR EVERY ORDER (owner, 2026-11-19: "that form is
 * only for a video campaign. Use that form as a base when the campaign is on
 * other media"). Every order carries the same details — prompt, publish
 * window, usage (channels, period, territory, restrictions), paid media,
 * exclusivity (category, period, area), disclosures, sponsor approval,
 * payment timing, non-cash consideration — and only the deliverable section
 * changes, by each job's medium (`media`, keyed by the NIL job):
 *
 *   SX-01 Story Drop          frames, platform, link, hours it stays up
 *   SX-02 Sponsored Post      single image or carousel, images, platform, caption, days it stays up
 *   SX-03 Athlete Reel        videos, length, orientation, platform (the template)
 *   SX-04 Product Experience  the product, the content format, whether it is kept
 *   SX-05 Local Appearance    event, date and time, place, hours on site, activities, who films
 *   SX-06 Content Day         shoot date, place, hours, finished pieces, who films, raw footage
 *   SX-07 Monthly Ambassador  months, and each month's mix of the jobs above
 *
 * A campaign keeps these (filled in when it is created — the builder), and
 * every offer and Campaign Order copies them for its own job, fixed when it
 * is sent. The order's older one-line fields (usage rights, exclusivity days,
 * disclosures, brief) are filled from them, so everything that reads those
 * keeps working.
 */
import { z } from "../contracts/zod";
import { requiresGuardian } from "./guardian-rules";
import { MATCH_CHANNELS } from "./match-vocabulary";

export const ORDER_DETAILS_VERSION = 1;

/** Where content is published or used. The match channels, plus the sponsor's own. */
export const ORDER_CHANNELS = [...MATCH_CHANNELS.filter((c) => c !== "IN_PERSON"), "SNAPCHAT", "SPONSOR_WEBSITE", "SPONSOR_EMAIL", "IN_STORE"] as const;
export const PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "FACEBOOK", "SNAPCHAT"] as const;
export const FILMED_BY = ["ATHLETE", "SPONSOR", "BTG", "NOBODY"] as const;
export const PAID_MEDIA_KINDS = ["BOOSTED_POSTS", "WHITELISTING", "DIGITAL_ADS", "TELEVISION", "PRINT", "BILLBOARDS", "PACKAGING"] as const;

const day = z.iso.date();
const text = (max: number) => z.string().trim().min(1).max(max);
const platform = z.enum(PLATFORMS);

/* ── each job's medium ───────────────────────────────────────────────────── */

const StoryDrop = z.object({
  frames: z.int().min(1).max(10),
  platform,
  link: z.enum(["NONE", "LINK_STICKER", "SWIPE_UP"]),
  hoursLive: z.int().min(1).max(72),
}).strict();
const SponsoredPost = z.object({
  format: z.enum(["SINGLE_IMAGE", "CAROUSEL", "VIDEO"]),
  images: z.int().min(1).max(10),
  platform,
  caption: z.string().trim().max(500).nullable(),
  daysLive: z.int().min(1).max(365),
}).strict();
const AthleteReel = z.object({
  videos: z.int().min(1).max(5),
  minSeconds: z.int().min(5).max(180),
  maxSeconds: z.int().min(5).max(180),
  orientation: z.enum(["VERTICAL", "HORIZONTAL", "SQUARE"]),
  platform,
}).strict().refine((m) => m.maxSeconds >= m.minSeconds, { message: "The longest a video may run is at least its shortest." });
const ProductExperience = z.object({
  product: text(200),
  contentFormat: z.enum(["VIDEO", "PHOTO", "BOTH"]),
  productKept: z.boolean(),
}).strict();
const LocalAppearance = z.object({
  event: text(200),
  startsAt: z.iso.datetime(),
  place: text(300),
  hoursOnSite: z.number().min(0.5).max(12),
  activities: text(500),
  filmedBy: z.enum(FILMED_BY),
}).strict();
const ContentDay = z.object({
  shootDate: day,
  place: text(300),
  hours: z.number().min(1).max(12),
  finishedPieces: z.int().min(1).max(50),
  filmedBy: z.enum(FILMED_BY),
  rawFootageIncluded: z.boolean(),
}).strict();
const MonthlyAmbassador = z.object({
  months: z.int().min(1).max(12),
  monthlyMix: z.array(z.object({ jobId: z.enum(["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06"]), quantity: z.int().min(1).max(10) }).strict()).min(1).max(6),
}).strict();

export const MEDIA_BY_JOB = {
  "SX-01": StoryDrop,
  "SX-02": SponsoredPost,
  "SX-03": AthleteReel,
  "SX-04": ProductExperience,
  "SX-05": LocalAppearance,
  "SX-06": ContentDay,
  "SX-07": MonthlyAmbassador,
} as const;
export type JobId = keyof typeof MEDIA_BY_JOB;
export const JOB_IDS = Object.keys(MEDIA_BY_JOB) as JobId[];

const OrderJob = z.discriminatedUnion("jobId", [
  z.object({ jobId: z.literal("SX-01"), media: StoryDrop }).strict(),
  z.object({ jobId: z.literal("SX-02"), media: SponsoredPost }).strict(),
  z.object({ jobId: z.literal("SX-03"), media: AthleteReel }).strict(),
  z.object({ jobId: z.literal("SX-04"), media: ProductExperience }).strict(),
  z.object({ jobId: z.literal("SX-05"), media: LocalAppearance }).strict(),
  z.object({ jobId: z.literal("SX-06"), media: ContentDay }).strict(),
  z.object({ jobId: z.literal("SX-07"), media: MonthlyAmbassador }).strict(),
]);

/* ── the details every order carries ─────────────────────────────────────── */

export const OrderDetailsSchema = z.object({
  version: z.literal(ORDER_DETAILS_VERSION),
  /** "Before a game, I gotta have ___. / What's yours?" */
  prompt: text(1000),
  publishWindow: z.object({ start: day, end: day }).strict().refine((w) => w.end >= w.start, { message: "The publish window ends on or after it starts." }),
  jobs: z.array(OrderJob).min(1).max(7),
  usage: z.object({
    channels: z.array(z.enum(ORDER_CHANNELS)).min(1).max(ORDER_CHANNELS.length),
    /** Days after the publish window ends; 0 is the window only. */
    periodDays: z.int().min(0).max(730),
    territory: text(120),
    restrictions: z.string().trim().max(1000).nullable(),
  }).strict(),
  paidMedia: z.discriminatedUnion("included", [
    z.object({ included: z.literal(false) }).strict(),
    z.object({
      included: z.literal(true),
      kinds: z.array(z.enum(PAID_MEDIA_KINDS)).min(1),
      platforms: z.array(z.enum(ORDER_CHANNELS)).max(ORDER_CHANNELS.length),
      durationDays: z.int().min(1).max(730),
      territory: text(120),
      /** Cents, on top of the compensation. */
      extraCompensationCents: z.int().min(0).max(100_000_000),
    }).strict(),
  ]),
  exclusivity: z.discriminatedUnion("included", [
    z.object({ included: z.literal(false) }).strict(),
    z.object({ included: z.literal(true), category: text(120), days: z.int().min(1).max(730), scope: text(120) }).strict(),
  ]),
  disclosures: z.array(text(60)).min(1).max(10),
  sponsorApproval: z.boolean(),
  /** When BTG pays once every deliverable is verified (and the sponsor has paid). */
  paymentTiming: z.object({ daysAfterVerified: z.int().min(0).max(90) }).strict(),
  nonCash: z.string().trim().max(500).nullable(),
}).strict();

export type OrderDetails = z.infer<typeof OrderDetailsSchema>;
export type OrderJobDetails = OrderDetails["jobs"][number] & { jobId: JobId; media: Record<string, unknown> };

/** A parse that answers in words — "usage.channels: …" — never a stack. */
export function parseOrderDetails(input: unknown): { ok: true; details: OrderDetails } | { ok: false; problems: string[] } {
  const r = OrderDetailsSchema.safeParse(input);
  if (r.success) return { ok: true, details: r.data };
  return { ok: false, problems: r.error.issues.map((i) => `${i.path.join(".") || "details"}: ${i.message}`) };
}

/* ── defaults: what the builder starts from, and what an old campaign gets ─ */

export const DEFAULT_PAYMENT_DAYS = 30;
export const DEFAULT_USAGE_DAYS = 90;

/** The medium a job starts from in the builder — the template's for a reel. */
export function defaultMedia(jobId: JobId, window: { start: string; end: string }): Record<string, unknown> {
  switch (jobId) {
    case "SX-01": return { frames: 3, platform: "INSTAGRAM", link: "LINK_STICKER", hoursLive: 24 };
    case "SX-02": return { format: "SINGLE_IMAGE", images: 1, platform: "INSTAGRAM", caption: null, daysLive: 90 };
    case "SX-03": return { videos: 1, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "INSTAGRAM" };
    case "SX-04": return { product: "The sponsor's product", contentFormat: "VIDEO", productKept: true };
    case "SX-05": return { event: "Sponsor appearance", startsAt: `${window.start}T17:00:00.000Z`, place: "To be confirmed with the sponsor", hoursOnSite: 2, activities: "Meet fans, photos and autographs", filmedBy: "SPONSOR" };
    case "SX-06": return { shootDate: window.start, place: "To be confirmed with the sponsor", hours: 4, finishedPieces: 5, filmedBy: "SPONSOR", rawFootageIncluded: false };
    case "SX-07": return { months: 1, monthlyMix: [{ jobId: "SX-02", quantity: 4 }] };
  }
}

/** A campaign's details when nobody set them: BTG's standard terms over the campaign's dates. */
export function defaultOrderDetails(input: {
  prompt: string;
  start: Date;
  end: Date;
  jobIds: string[];
  /** The package's exclusivity, where it has one and the sponsor has categories. */
  exclusivity?: { category: string; days: number } | null;
  sponsorApproval?: boolean;
  disclosures?: string[];
}): OrderDetails {
  const window = { start: input.start.toISOString().slice(0, 10), end: input.end.toISOString().slice(0, 10) };
  const jobs = [...new Set(input.jobIds)].filter((j): j is JobId => j in MEDIA_BY_JOB);
  return {
    version: ORDER_DETAILS_VERSION,
    prompt: input.prompt.trim().slice(0, 1000) || "Share what this sponsor means to you.",
    publishWindow: window,
    jobs: (jobs.length ? jobs : (["SX-02"] as JobId[])).map((jobId) => ({ jobId, media: defaultMedia(jobId, window) })) as OrderDetails["jobs"],
    usage: { channels: ["INSTAGRAM"], periodDays: DEFAULT_USAGE_DAYS, territory: "United States", restrictions: null },
    paidMedia: { included: false },
    exclusivity: input.exclusivity ? { included: true, category: input.exclusivity.category, days: input.exclusivity.days, scope: "United States" } : { included: false },
    disclosures: input.disclosures?.length ? input.disclosures : ["#ad"],
    sponsorApproval: input.sponsorApproval ?? false,
    paymentTiming: { daysAfterVerified: DEFAULT_PAYMENT_DAYS },
    nonCash: null,
  };
}

/** One job's slice — what an offer and its order carry. */
export function detailsForJob(d: OrderDetails, jobId: string): OrderDetails {
  const jobs = d.jobs.filter((j) => j.jobId === jobId);
  return { ...d, jobs: jobs.length ? jobs : d.jobs.slice(0, 1) };
}

/* ── in plain words: the order's one-line fields, and the deliverable titles ─ */

const WORDS = (s: string) => s.toLowerCase().replace(/_/g, " ");
const CHANNEL_WORDS: Record<string, string> = {
  INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", X: "X", FACEBOOK: "Facebook", SNAPCHAT: "Snapchat",
  SPONSOR_WEBSITE: "the sponsor's website", SPONSOR_EMAIL: "the sponsor's email", IN_STORE: "in store",
};
const channelList = (cs: readonly string[]) => cs.map((c) => CHANNEL_WORDS[c] ?? WORDS(c)).join(", ");
const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

/** The usage line the order's `usageRights` holds. */
export function usageWords(d: OrderDetails): string {
  const period = d.usage.periodDays === 0 ? "during the publish window only" : `during the publish window and for ${d.usage.periodDays} days after it ends`;
  const extra = d.usage.restrictions ? ` ${d.usage.restrictions}` : "";
  const paid = d.paidMedia.included
    ? ` Paid media included: ${d.paidMedia.kinds.map(WORDS).join(", ")}${d.paidMedia.platforms.length ? ` on ${channelList(d.paidMedia.platforms)}` : ""}, for ${d.paidMedia.durationDays} days, in ${d.paidMedia.territory}, for ${usd(d.paidMedia.extraCompensationCents)} more.`
    : " Paid media is not included.";
  return `Organic use on ${channelList(d.usage.channels)}, ${period}, in ${d.usage.territory}.${extra}${paid}`;
}

/** The exclusivity line the order's `exclusivity` holds. */
export function exclusivityWords(d: OrderDetails): string | null {
  return d.exclusivity.included ? `${d.exclusivity.category}, for ${d.exclusivity.days} days from acceptance, in ${d.exclusivity.scope}` : null;
}

/** What a job's medium asks for, in words — what a deliverable's title adds. */
export function mediaWords(job: { jobId: string; media: Record<string, unknown> }): string {
  const m = job.media as Record<string, never>;
  const p = (v: string) => CHANNEL_WORDS[v] ?? WORDS(v);
  switch (job.jobId) {
    case "SX-01": return `${m.frames} story frame${m.frames === 1 ? "" : "s"} on ${p(m.platform)}, up for ${m.hoursLive} hours${m.link === "NONE" ? "" : `, with a ${WORDS(m.link)}`}`;
    case "SX-02": return `${m.format === "CAROUSEL" ? `a ${m.images}-image carousel` : m.format === "VIDEO" ? "a video post" : "a single-image post"} on ${p(m.platform)}, kept up ${m.daysLive} days`;
    case "SX-03": return `${m.videos} × ${m.minSeconds}–${m.maxSeconds} second ${WORDS(m.orientation)} video${m.videos === 1 ? "" : "s"} for ${p(m.platform)}`;
    case "SX-04": return `${WORDS(m.contentFormat)} content about ${m.product}${m.productKept ? " (the product is kept)" : " (the product is returned)"}`;
    case "SX-05": return `${m.event} at ${m.place}, ${m.hoursOnSite} hours on site — ${m.activities}`;
    case "SX-06": return `a ${m.hours}-hour shoot at ${m.place} on ${m.shootDate}: ${m.finishedPieces} finished pieces${m.rawFootageIncluded ? ", raw footage included" : ""}`;
    case "SX-07": return `${m.months} month${m.months === 1 ? "" : "s"} as ambassador: each month ${(m.monthlyMix as unknown as Array<{ jobId: string; quantity: number }>).map((x) => `${x.quantity} × ${x.jobId}`).join(", ")}`;
    default: return "";
  }
}

/**
 * The deliverables an order owes, from the job's template and its medium: a
 * reel campaign owes one deliverable per video; every title says what the
 * medium asks for.
 */
export function deliverablesFromDetails(
  template: Array<{ title: string; dueDate: Date }>,
  job: { jobId: string; media: Record<string, unknown> } | undefined,
): Array<{ title: string; dueDate: Date }> {
  if (!job) return template;
  const words = mediaWords(job);
  if (job.jobId === "SX-03") {
    const n = Number((job.media as { videos?: number }).videos ?? 1);
    const last = template[template.length - 1]!;
    return Array.from({ length: n }, (_, i) => ({ title: `Athlete reel${n > 1 ? ` ${i + 1} of ${n}` : ""} — ${words}`, dueDate: last.dueDate }));
  }
  return template.map((t, i) => ({ title: i === template.length - 1 && words ? `${t.title} — ${words}` : t.title, dueDate: t.dueDate }));
}

/* ── automation rules (owner, 2026-11-19: "we focus on automation rules") ──
   An order is issued automatically when every check passes; a failing check
   hands it to BTG with the reason — the campaign's automatic staffing stops
   (a campaign-wide reason), or one athlete is skipped (a reason about them). */

/* A sensitive category is not here: a brief in one is already held for a
   person at BTG (brief-auto.ts), and a campaign exists only once that person
   approved it — holding its orders again would ask twice. */
export function campaignHolds(d: OrderDetails, _categories: readonly string[]): string[] {
  const out: string[] = [];
  if (d.paidMedia.included && d.paidMedia.extraCompensationCents <= 0) out.push("Paid media is included with no extra pay for the athlete: BTG sets the pay before any order goes out.");
  return out;
}

export function athleteHolds(d: OrderDetails, athlete: { birthDate: Date | null; ageBand: string | null; majorityAge?: number | null }): string[] {
  if (!requiresGuardian(athlete)) return [];
  const out: string[] = [];
  if (d.paidMedia.included) out.push("Paid media for a minor: a person at BTG decides with the guardian.");
  if (d.exclusivity.included) out.push("Exclusivity for a minor: a person at BTG decides with the guardian.");
  return out;
}

/* ── the order number: SX-<campaign code>-<year>-<sequence> ───────────────── */

const STOP = new Set(["the", "a", "an", "of", "and", "or", "for", "to", "on", "in", "at", "your", "my", "our", "with", "whats", "what", "is", "it", "its", "by", "x"]);

/** Three letters from the campaign's name: the first letters of its words that matter, then letters of the last. */
export function suggestOrderCode(name: string): string {
  const words = name.normalize("NFKD").replace(/[^A-Za-z\s]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "SPX";
  const kept = words.filter((w) => !STOP.has(w));
  const use = kept.length ? kept : words;
  let code = use.map((w) => w[0]).join("").slice(0, 3);
  const tail = (use[use.length - 1] ?? "sponsorx").slice(1);
  for (const ch of tail) { if (code.length >= 3) break; code += ch; }
  return (code + "XXX").slice(0, 3).toUpperCase();
}

export const ORDER_CODE = /^[A-Z]{3}$/;

/** Candidates after the suggestion, when it is taken this year: change the last letter, then the last two. */
export function* orderCodeCandidates(first: string): Generator<string> {
  yield first;
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const c of A) if (c !== first[2]) yield first.slice(0, 2) + c;
  for (const b of A) for (const c of A) yield first[0] + b + c;
}

export function orderNumber(code: string, year: number, sequence: number): string {
  return `SX-${code}-${year}-${String(sequence).padStart(4, "0")}`;
}
