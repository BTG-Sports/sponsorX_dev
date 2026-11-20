/* --------------------------------------------------------------------------
   An athlete order's details, as the Athlete Campaign Order template lays
   them out — POL-FE-116 (polish.md §116, backend order-details-rules.ts).

   The template is the base for every order (owner, 2026-11-19): the same
   fields on each — prompt, publish window, usage, paid media, exclusivity,
   disclosures, approval, payment timing, non-cash consideration — and only
   the deliverable section changes, by each job's medium (SX-01 … SX-07).

   Pure: no fetch, no clock. Three screens read these the same way, so an
   order reads the same wherever it is shown:
     - the sponsor's campaign builder, as the summary before saving;
     - the athlete's offer and order pages, before and after accepting;
     - BTG's campaign page.

   The API is the enforcement (it parses every field); this file only says
   the details in words and lays them out in the template's order.
   -------------------------------------------------------------------------- */

export const JOB_IDS = ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06", "SX-07"] as const;
export type JobId = (typeof JOB_IDS)[number];

/** backend/src/domain/nil-jobs.ts — the seven NIL jobs by name. */
export const JOB_NAME: Record<JobId, string> = {
  "SX-01": "Story Drop",
  "SX-02": "Sponsored Post",
  "SX-03": "Athlete Reel",
  "SX-04": "Product Experience",
  "SX-05": "Local Appearance",
  "SX-06": "Content Day",
  "SX-07": "Monthly Ambassador",
};
export const isJobId = (v: unknown): v is JobId => typeof v === "string" && (JOB_IDS as readonly string[]).includes(v);
export const jobLabel = (jobId: string) => (isJobId(jobId) ? `${jobId} ${JOB_NAME[jobId]}` : jobId);

export type OrderJob = { jobId: string; media: Record<string, unknown> };

export type PaidMedia =
  | { included: false }
  | {
      included: true;
      kinds: string[];
      platforms: string[];
      durationDays: number;
      territory: string;
      /** Cents, on top of the compensation. Absent for a reader who may not see the athlete's pay. */
      extraCompensationCents?: number;
    };

export type Exclusivity = { included: false } | { included: true; category: string; days: number; scope: string };

export type OrderDetails = {
  version: 1;
  prompt: string;
  publishWindow: { start: string; end: string };
  jobs: OrderJob[];
  usage: { channels: string[]; periodDays: number; territory: string; restrictions: string | null };
  paidMedia: PaidMedia;
  exclusivity: Exclusivity;
  disclosures: string[];
  sponsorApproval: boolean;
  paymentTiming: { daysAfterVerified: number };
  nonCash: string | null;
};

/** What the API sent, if it is an order's details; null for anything else (an order made before POL-BE-116 has none). */
export function readOrderDetails(value: unknown): OrderDetails | null {
  const d = value as Partial<OrderDetails> | null | undefined;
  if (!d || typeof d !== "object") return null;
  const ok =
    typeof d.prompt === "string" &&
    typeof d.publishWindow?.start === "string" &&
    typeof d.publishWindow?.end === "string" &&
    Array.isArray(d.jobs) &&
    d.jobs.every((j) => j && typeof j.jobId === "string" && !!j.media && typeof j.media === "object") &&
    Array.isArray(d.usage?.channels) &&
    typeof d.usage?.periodDays === "number" &&
    typeof d.usage?.territory === "string" &&
    typeof d.paidMedia?.included === "boolean" &&
    typeof d.exclusivity?.included === "boolean" &&
    Array.isArray(d.disclosures) &&
    typeof d.sponsorApproval === "boolean" &&
    typeof d.paymentTiming?.daysAfterVerified === "number";
  return ok ? (d as OrderDetails) : null;
}

/* ── words ───────────────────────────────────────────────────────────────── */

const CHANNEL_WORD: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  FACEBOOK: "Facebook",
  SNAPCHAT: "Snapchat",
  IN_PERSON: "In person",
  SPONSOR_WEBSITE: "The sponsor's website",
  SPONSOR_EMAIL: "The sponsor's email",
  IN_STORE: "In store",
};
const PAID_KIND_WORD: Record<string, string> = {
  BOOSTED_POSTS: "Boosted posts",
  WHITELISTING: "Whitelisting",
  DIGITAL_ADS: "Digital ads",
  TELEVISION: "Television",
  PRINT: "Print",
  BILLBOARDS: "Billboards",
  PACKAGING: "Product packaging",
};
const CHOICE_WORD: Record<string, string> = {
  NONE: "None",
  LINK_STICKER: "Link sticker",
  SWIPE_UP: "Swipe up",
  SINGLE_IMAGE: "Single image",
  CAROUSEL: "Carousel",
  VIDEO: "Video",
  PHOTO: "Photo",
  BOTH: "Video and photo",
  VERTICAL: "Vertical",
  HORIZONTAL: "Horizontal",
  SQUARE: "Square",
  ATHLETE: "The athlete",
  SPONSOR: "The sponsor",
  BTG: "BTG",
  NOBODY: "Nobody",
};

/** "SPONSOR_WEBSITE" → "sponsor website", for a value this file doesn't know. */
const lower = (s: string) => s.toLowerCase().replace(/_/g, " ");
const sentence = (s: string) => {
  const t = lower(s);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const channelWord = (c: string) => CHANNEL_WORD[c] ?? sentence(c);
export const paidKindWord = (k: string) => PAID_KIND_WORD[k] ?? sentence(k);
/** A choice in a medium's own list: "LINK_STICKER" → "Link sticker"; a platform by its name. */
export const choiceWord = (v: string) => CHOICE_WORD[v] ?? CHANNEL_WORD[v] ?? sentence(v);

/** Inside a sentence: "Instagram", "the sponsor's website". */
const channelInline = (c: string) => {
  const w = channelWord(c);
  return /^(The|In) /.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w;
};
const list = (items: string[]) => items.join(", ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 12500 → "$125", 12550 → "$125.50". */
export function centsWords(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-12-01" → "Dec 1, 2026"; anything else as it came. */
export function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}` : day;
}
/** An ISO moment → "Dec 1, 2026, 5:00 PM" in the viewer's time; anything else as it came. */
export function momentWords(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}
export function windowWords(w: { start: string; end: string }): string {
  return w.start === w.end ? dayWords(w.start) : `${dayWords(w.start)} to ${dayWords(w.end)}`;
}

/**
 * What a job's medium asks for, in one line — the template's "Deliverable".
 * The same words the API puts in a deliverable's title (backend mediaWords);
 * the test compares the two on every job's defaults.
 */
export function mediaWords(job: OrderJob): string {
  const m = job.media as Record<string, never>;
  const p = (v: string) => channelInline(v);
  switch (job.jobId) {
    case "SX-01":
      return `${m.frames} story frame${m.frames === 1 ? "" : "s"} on ${p(m.platform)}, up for ${m.hoursLive} hours${m.link === "NONE" ? "" : `, with a ${lower(m.link)}`}`;
    case "SX-02":
      return `${m.format === "CAROUSEL" ? `a ${m.images}-image carousel` : m.format === "VIDEO" ? "a video post" : "a single-image post"} on ${p(m.platform)}, kept up ${m.daysLive} days`;
    case "SX-03":
      return `${m.videos} × ${m.minSeconds}–${m.maxSeconds} second ${lower(m.orientation)} video${m.videos === 1 ? "" : "s"} for ${p(m.platform)}`;
    case "SX-04":
      return `${lower(m.contentFormat)} content about ${m.product}${m.productKept ? " (the product is kept)" : " (the product is returned)"}`;
    case "SX-05":
      return `${m.event} at ${m.place}, ${m.hoursOnSite} hours on site — ${m.activities}`;
    case "SX-06":
      return `a ${m.hours}-hour shoot at ${m.place} on ${m.shootDate}: ${m.finishedPieces} finished pieces${m.rawFootageIncluded ? ", raw footage included" : ""}`;
    case "SX-07":
      return `${m.months} month${m.months === 1 ? "" : "s"} as ambassador: each month ${mixOf(m).map((x) => `${x.quantity} × ${x.jobId}`).join(", ")}`;
    default:
      return "";
  }
}

const mixOf = (media: Record<string, unknown>): Array<{ jobId: string; quantity: number }> =>
  Array.isArray(media.monthlyMix) ? (media.monthlyMix as Array<{ jobId: string; quantity: number }>).filter((x) => x && typeof x.jobId === "string") : [];

export type SheetRow = { label: string; value: string };

/** The medium's own fields, one per line — the deliverable section in full. */
export function mediaRows(job: OrderJob, timeZone?: string): SheetRow[] {
  const m = job.media as Record<string, never>;
  const yesNo = (v: unknown) => (v ? "Yes" : "No");
  switch (job.jobId) {
    case "SX-01":
      return [
        { label: "Story frames", value: String(m.frames) },
        { label: "Platform", value: channelWord(m.platform) },
        { label: "Link", value: choiceWord(m.link) },
        { label: "Stays up", value: plural(m.hoursLive, "hour") },
      ];
    case "SX-02":
      return [
        { label: "Format", value: choiceWord(m.format) },
        { label: "Images", value: String(m.images) },
        { label: "Platform", value: channelWord(m.platform) },
        { label: "Caption", value: m.caption || "The athlete's own words" },
        { label: "Stays up", value: plural(m.daysLive, "day") },
      ];
    case "SX-03":
      return [
        { label: "Videos", value: String(m.videos) },
        { label: "Length", value: `${m.minSeconds} to ${m.maxSeconds} seconds` },
        { label: "Format", value: choiceWord(m.orientation) },
        { label: "Platform", value: channelWord(m.platform) },
      ];
    case "SX-04":
      return [
        { label: "Product", value: String(m.product) },
        { label: "Content", value: choiceWord(m.contentFormat) },
        { label: "The athlete keeps the product", value: yesNo(m.productKept) },
      ];
    case "SX-05":
      return [
        { label: "Event", value: String(m.event) },
        { label: "Date and time", value: momentWords(String(m.startsAt), timeZone) },
        { label: "Place", value: String(m.place) },
        { label: "Time on site", value: plural(m.hoursOnSite, "hour") },
        { label: "Activities", value: String(m.activities) },
        { label: "Who films", value: choiceWord(m.filmedBy) },
      ];
    case "SX-06":
      return [
        { label: "Shoot date", value: dayWords(String(m.shootDate)) },
        { label: "Place", value: String(m.place) },
        { label: "Length of the shoot", value: plural(m.hours, "hour") },
        { label: "Finished pieces", value: String(m.finishedPieces) },
        { label: "Who films", value: choiceWord(m.filmedBy) },
        { label: "Raw footage included", value: yesNo(m.rawFootageIncluded) },
      ];
    case "SX-07":
      return [
        { label: "Months", value: String(m.months) },
        { label: "Each month", value: mixOf(m).map((x) => `${x.quantity} × ${jobLabel(x.jobId)}`).join(", ") || "Not set" },
      ];
    default:
      return [];
  }
}

/* ── each line of the template ───────────────────────────────────────────── */

export function usagePeriodWords(periodDays: number): string {
  return periodDays === 0 ? "During the publish window only" : `During the publish window and for ${plural(periodDays, "day")} after it ends`;
}
export function paymentWords(daysAfterVerified: number): string {
  return daysAfterVerified === 0
    ? "As soon as every deliverable is verified and the sponsor has paid"
    : `Within ${plural(daysAfterVerified, "day")} after every deliverable is verified and the sponsor has paid`;
}
export function approvalWords(sponsorApproval: boolean): string {
  return `BTG approval required; sponsor approval: ${sponsorApproval ? "yes" : "no"}`;
}
export function exclusivityLine(e: Exclusivity): string {
  return e.included ? `${e.category}, for ${plural(e.days, "day")} from acceptance, in ${e.scope}` : "None";
}
export function paidMediaLine(p: PaidMedia): string {
  if (!p.included) return "Not included";
  const on = p.platforms.length ? ` on ${list(p.platforms.map(channelInline))}` : "";
  const pay = p.extraCompensationCents === undefined ? "" : p.extraCompensationCents > 0 ? `, for ${centsWords(p.extraCompensationCents)} more` : ", extra pay set by BTG";
  return `${list(p.kinds.map(paidKindWord))}${on}, for ${plural(p.durationDays, "day")}, in ${p.territory}${pay}`;
}

/* ── the sheet: the order laid out like the template ─────────────────────── */

export type OrderSheetInput = {
  details: OrderDetails;
  /** "SX-PGM-2026-0001"; before an order exists, what will be given. */
  orderNumber?: string | null;
  athlete?: string | null;
  sponsor?: string | null;
  campaign?: string | null;
  /** "$250.00" — as the page already words it; left out where the reader may not see it. */
  compensation?: string | null;
  /** The viewer's time zone for an appearance's date and time. */
  timeZone?: string;
};

export type OrderSheetSection = { id: string; title: string; note?: string; rows: SheetRow[] };
export type OrderSheet = {
  /** The template's table at the top: Order #, Athlete, Sponsor, Campaign, Job, Prompt, … Payment timing. */
  head: SheetRow[];
  /** One block per job: the deliverable in full, by its medium. */
  deliverables: Array<{ jobId: string; title: string; summary: string; rows: SheetRow[] }>;
  /** The template's numbered sections 2 to 5. */
  sections: OrderSheetSection[];
};

/** Whether paid media is included with nothing extra for the athlete — the API then holds the campaign's orders for BTG. */
export const paidMediaNeedsPay = (d: OrderDetails) => d.paidMedia.included && (d.paidMedia.extraCompensationCents ?? 1) <= 0;

export function orderSheet(input: OrderSheetInput): OrderSheet {
  const d = input.details;
  const head: SheetRow[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) head.push({ label, value });
  };
  add("Order #", input.orderNumber);
  add("Athlete", input.athlete);
  add("Sponsor", input.sponsor);
  add("Campaign", input.campaign);
  add("Job", list(d.jobs.map((j) => jobLabel(j.jobId))));
  add("Prompt", d.prompt);
  add("Deliverable", d.jobs.map(mediaWords).filter(Boolean).join("; "));
  add("Due / publish window", windowWords(d.publishWindow));
  add("Compensation", input.compensation);
  add("Exclusivity", exclusivityLine(d.exclusivity));
  add("Disclosure", d.disclosures.join(" / "));
  add("Approval", approvalWords(d.sponsorApproval));
  add("Payment timing", paymentWords(d.paymentTiming.daysAfterVerified));

  const paid = d.paidMedia;
  const excl = d.exclusivity;
  return {
    head,
    deliverables: d.jobs.map((j) => ({ jobId: j.jobId, title: jobLabel(j.jobId), summary: mediaWords(j), rows: mediaRows(j, input.timeZone) })),
    sections: [
      {
        id: "usage",
        title: "Content and usage rights",
        note: "The athlete keeps ownership of what they make. The sponsor and BTG may use it only as set out here.",
        rows: [
          { label: "Authorized channels", value: list(d.usage.channels.map(channelWord)) },
          { label: "Usage period", value: usagePeriodWords(d.usage.periodDays) },
          { label: "Territory", value: d.usage.territory },
          { label: "Additional rights / restrictions", value: d.usage.restrictions || "None" },
        ],
      },
      {
        id: "paid",
        title: "Paid media",
        note: paid.included ? undefined : "Paid advertising, boosted posts, whitelisting and other expanded uses are not included in this order.",
        rows: paid.included
          ? [
              { label: "What is added", value: list(paid.kinds.map(paidKindWord)) },
              { label: "Platforms", value: paid.platforms.length ? list(paid.platforms.map(channelWord)) : "Not limited to a platform" },
              { label: "Duration", value: plural(paid.durationDays, "day") },
              { label: "Territory", value: paid.territory },
              ...(paid.extraCompensationCents === undefined
                ? []
                : [{ label: "Additional compensation", value: paid.extraCompensationCents > 0 ? centsWords(paid.extraCompensationCents) : "Set by BTG before any order goes out" }]),
            ]
          : [{ label: "Paid media", value: "Not included" }],
      },
      {
        id: "exclusivity",
        title: "Exclusivity / conflicts",
        rows: excl.included
          ? [
              { label: "Restricted category", value: excl.category },
              { label: "Exclusivity period", value: `${plural(excl.days, "day")} from acceptance` },
              { label: "Geographic scope", value: excl.scope },
            ]
          : [{ label: "Exclusivity", value: "None" }],
      },
      {
        id: "payment",
        title: "Compensation and payment",
        rows: [
          ...(input.compensation ? [{ label: "Compensation", value: input.compensation }] : []),
          { label: "Payment timing", value: paymentWords(d.paymentTiming.daysAfterVerified) },
          { label: "Product / non-cash consideration", value: d.nonCash || "None" },
        ],
      },
    ],
  };
}

/* ── BTG: why an order is held ───────────────────────────────────────────── */

/** How the API opens a hold made by the order rules (auto-staffing.ts). */
export const ORDER_HOLD_PREFIX = "Held for BTG by the order rules:";

/**
 * The order rules' reasons out of a staffing stop or a skipped athlete's
 * reason, one per sentence; [] for any other reason (a stop BTG made by hand,
 * an athlete skipped for a conflict).
 */
export function orderHoldReasons(reason: string | null | undefined): string[] {
  const t = (reason ?? "").trim();
  if (!t.startsWith(ORDER_HOLD_PREFIX)) return [];
  const rest = t.slice(ORDER_HOLD_PREFIX.length).trim();
  return rest.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}
