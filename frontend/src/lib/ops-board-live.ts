/* --------------------------------------------------------------------------
   P7-FE-06 — the admin Operations Board, from three live reads:

     GET /operations/board             the "needs BTG action" queues — four,
                                       plus payouts waiting for BTG (POL-FE-12)
                                       (null where the role doesn't read one)
     GET /operations/delivery-health   live campaigns, deliverables done / due
     GET /operations/integration-health  dependencies, Zoho, worker queue

   It replaced a board of sample figures (quarterly GMV, growth percentages,
   "median brief → match") that had no source; those are gone, not
   estimated. Every card links to the page whose count it shows.
   -------------------------------------------------------------------------- */

import { DESK_TIME_ZONE, postHref, reviewBy } from "@/lib/approvals-live";
import type { ApiDeliverable } from "@/lib/deliverables-live";

/** A queue with a "since": how many wait, and when the oldest started waiting. */
export type ApiWaitingQueue = { waiting: number; oldestSince: string | null };

export type ApiQueues = {
  applications: { waiting: number; over48h: number } | null;
  approvals: { waiting: number } | null;
  briefs: { toQualify: number; toMatch: number } | null;
  finance: { held: number; disputed: number } | null;
  /** POL-BE-12 — payouts waiting for BTG: held at request, or failed and
   *  handed to BTG. Null for a role that doesn't read every payout; absent
   *  from an API older than 2026-10-29. */
  payouts?: ApiWaitingQueue | null;
  /** POL-BE-14 — open make-goods. Its card is POL-FE-15's; typed so the read
   *  is honest, not drawn yet. */
  makeGoods?: ApiWaitingQueue | null;
};

export type ApiDeliveryHealth = {
  campaignId: string;
  campaignName: string;
  endDate: string;
  deliverablesTotal: number;
  deliverablesVerified: number;
  deliverablesOverdue: number;
};

export type ApiIntegrationHealth = {
  checkedAt: string;
  dependencies: { db: boolean; redis: boolean; storage: boolean };
  sync: { entity: string; linked: number; total: number; lastSyncAt: string | null }[];
  webhooks: { bySource: { source: string; received: number; applied: number; rejected: number; lastAt: string | null }[] };
  queue: {
    outboxPending: { name: string; count: number; oldest: string }[];
    jobs: { name: string; state: string; count: number }[];
  };
};

type Tone = "warn" | "danger" | "primary" | "neutral";
export type QueueCard = {
  key: "applications" | "approvals" | "briefs" | "finance" | "payouts";
  label: string;
  hint: string;
  count: number;
  href: string;
  chips: { text: string; tone: Tone }[];
};

/** The cards a role gets — only the queues it reads, in the loop's order. */
export function queueCards(q: ApiQueues): QueueCard[] {
  const cards: QueueCard[] = [];
  if (q.applications) {
    cards.push({
      key: "applications", label: "Athlete applications", hint: "Submitted or under review",
      count: q.applications.waiting, href: "/admin/applications",
      chips: q.applications.over48h ? [{ text: `${q.applications.over48h} over 48 hours`, tone: "warn" }] : [],
    });
  }
  if (q.approvals) {
    cards.push({
      key: "approvals", label: "Content approvals", hint: "Deliverables awaiting a decision",
      count: q.approvals.waiting, href: "/admin/approvals", chips: [],
    });
  }
  if (q.briefs) {
    const chips: QueueCard["chips"] = [];
    if (q.briefs.toQualify) chips.push({ text: `${q.briefs.toQualify} to qualify`, tone: "warn" });
    if (q.briefs.toMatch) chips.push({ text: `${q.briefs.toMatch} to match`, tone: "primary" });
    cards.push({
      key: "briefs", label: "Briefs", hint: "Waiting to qualify or match",
      count: q.briefs.toQualify + q.briefs.toMatch, href: "/admin/briefs", chips,
    });
  }
  if (q.finance) {
    const chips: QueueCard["chips"] = [];
    if (q.finance.held) chips.push({ text: `${q.finance.held} held`, tone: "warn" });
    if (q.finance.disputed) chips.push({ text: `${q.finance.disputed} disputed`, tone: "danger" });
    cards.push({
      key: "finance", label: "Finance", hint: "Earnings needing attention",
      count: q.finance.held + q.finance.disputed, href: "/admin/finance", chips,
    });
  }
  /* POL-FE-12 — a held payout used to be silent: the payee read "BTG reviews
     it next" and nobody at BTG was counting. The card opens the payouts desk,
     whose Waiting tab is the held ones and whose Failed tab is what the
     provider handed back. */
  if (q.payouts) {
    const since = q.payouts.waiting > 0 ? sinceDay(q.payouts.oldestSince) : null;
    cards.push({
      key: "payouts", label: "Payouts to review", hint: "Held for BTG, or failed and handed back",
      count: q.payouts.waiting, href: "/admin/payouts",
      chips: since ? [{ text: `oldest waiting since ${since}`, tone: "warn" }] : [],
    });
  }
  return cards;
}

/** "Oct 24" — the day the oldest started waiting, on the desk's clock
 *  (America/New_York, as review-by dates are); null without a usable time. */
export function sinceDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DESK_TIME_ZONE });
}

export function actionTotal(cards: QueueCard[]): number {
  return cards.reduce((n, c) => n + c.count, 0);
}

/* --------------------------------------------------------------------------
   P1-ART-14 — the "Mission Control" stage's pure pieces: the headline's
   words and the action ring's arcs. Both read only the queue cards above, so
   the stage shows no figure the board didn't already have.
   -------------------------------------------------------------------------- */

/** Each queue's hue on the stage — its ring arc and its card's foot strip.
 *  Fixed-dark literals (the --sx-on-media rule): the stage is dark in both
 *  themes. Blue then orange, the lockup's split. */
export const QUEUE_TONE: Record<QueueCard["key"], string> = {
  applications: "#2e9bf5",
  approvals: "#9be0ff",
  briefs: "#fb923c",
  finance: "#f97a1f",
  /* POL-FE-12 — amber, so money waiting for a person reads apart from the
     two oranges beside it. */
  payouts: "#ffb020",
};

export type BoardHeadline = { lead: string; hand: string; tail: string };

/** "23 things need / BTG's hand today." — `null` when the role reads no queue. */
export function boardHeadline(total: number | null): BoardHeadline {
  const hand = "BTG’s hand";
  if (total === null) return { lead: "Operations,", hand: "live", tail: "today." };
  if (total === 0) return { lead: "Nothing needs", hand, tail: "right now." };
  const n = total.toLocaleString("en-US");
  return { lead: total === 1 ? `${n} thing needs` : `${n} things need`, hand, tail: "today." };
}

export type RingSegment = { key: QueueCard["key"]; len: number; offset: number; color: string };

/** The smallest arc a non-empty queue draws, so one item beside thousands still shows. */
const MIN_ARC = 2;

/** One arc per queue with work, sized by its share of the total, `gap` apart.
 *  `offset` is where the arc starts along the circle (for stroke-dashoffset).
 *  A lone queue closes the circle with no gap; nothing waiting draws nothing. */
export function ringSegments(cards: QueueCard[], circumference: number, gap: number): RingSegment[] {
  const live = cards.filter((c) => c.count > 0);
  const total = actionTotal(live);
  if (live.length === 0) return [];
  if (live.length === 1) {
    const c = live[0]!;
    return [{ key: c.key, len: circumference, offset: 0, color: QUEUE_TONE[c.key] }];
  }
  let at = 0;
  return live.map((c) => {
    const share = (c.count / total) * circumference;
    const seg = { key: c.key, len: Math.max(MIN_ARC, share - gap), offset: at, color: QUEUE_TONE[c.key] };
    at += share;
    return seg;
  });
}

export type CampaignLine = {
  id: string;
  name: string;
  mono: string;
  done: number;
  due: number;
  /** Rounded percent of deliverables done; 0 when none are due yet. */
  pct: number;
  overdue: number;
  ends: string;
};

export function campaignLines(rows: ApiDeliveryHealth[]): CampaignLine[] {
  return rows
    .map((r) => ({
      id: r.campaignId,
      name: r.campaignName,
      mono: r.campaignName.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase(),
      done: r.deliverablesVerified,
      due: r.deliverablesTotal,
      pct: r.deliverablesTotal ? Math.round((r.deliverablesVerified / r.deliverablesTotal) * 100) : 0,
      overdue: r.deliverablesOverdue,
      ends: `Ends ${new Date(r.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
    }))
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}

/* --------------------------------------------------------------------------
   POL-FE-23 — the posts waiting on BTG, each with its review-by date and a
   link straight to the post (the desk with its drawer open), not to a
   list. From GET /deliverables?state=DRAFT_SUBMITTED,BTG_REVIEW
   &systemReturned=exclude&sort=waiting — BTG's own queue, longest wait
   first — the board shows the first few, soonest review-by first.
   -------------------------------------------------------------------------- */

/** The fields of a GET /deliverables row the board reads. */
export type ApiReviewRow = Pick<ApiDeliverable, "id" | "title" | "state" | "dueDate" | "revision"> & {
  athlete: { displayName: string };
  campaign: { name: string };
  waitingSince?: string | null;
  latestAsset?: { uploadedAt: string } | null;
};

export type ReviewLine = {
  id: string;
  title: string;
  athlete: string;
  campaign: string;
  /** "Review by Oct 16"; "Review date unknown" when the API gave nothing to count from. */
  by: string;
  late: boolean;
  /** The post itself — /admin/approvals?open=<id>. */
  href: string;
};

/** How many waiting posts the board lists; the rest are on the desk. */
export const BOARD_REVIEWS = 5;

export function reviewLines(rows: ApiReviewRow[], now: Date, limit = BOARD_REVIEWS): ReviewLine[] {
  return rows
    .map((r): [number, ReviewLine] => {
      const by = reviewBy(r, now);
      return [
        /* sort key — never shown; nothing to count from sorts last */
        by ? Date.parse(by.iso) : Number.POSITIVE_INFINITY,
        {
          id: r.id,
          title: r.title,
          athlete: r.athlete.displayName,
          campaign: r.campaign.name,
          by: by ? `Review by ${by.label}` : "Review date unknown",
          late: by?.late ?? false,
          href: postHref(r.id),
        },
      ];
    })
    .sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title))
    .slice(0, limit)
    .map(([, line]) => line);
}

/** Outbox work older than this means the worker isn't draining (the Integrations page's rule). */
export const STALE_MINUTES = 15;

export type HealthRow = { name: string; detail: string; status: "Operational" | "Degraded" | "Down" | "Syncing" };

/** One line per dependency the API actually reports — no row without a source. */
export function healthRows(h: ApiIntegrationHealth): HealthRow[] {
  const now = Date.parse(h.checkedAt);
  const pendingTotal = h.queue.outboxPending.reduce((n, p) => n + p.count, 0);
  const stale = h.queue.outboxPending.some((p) => now - Date.parse(p.oldest) > STALE_MINUTES * 60_000);
  const failed = h.queue.jobs.filter((j) => j.state === "failed").reduce((n, j) => n + j.count, 0);
  const zohoPending = h.queue.outboxPending.filter((p) => p.name.startsWith("zoho.")).reduce((n, p) => n + p.count, 0);
  const lastSync = h.sync.map((s) => s.lastSyncAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const rejected = h.webhooks.bySource.filter((s) => s.source.startsWith("zoho")).reduce((n, s) => n + s.rejected, 0);
  return [
    { name: "Postgres", detail: "Products · queue · audit log", status: h.dependencies.db ? "Operational" : "Down" },
    {
      name: "Worker queue",
      detail: `${pendingTotal} waiting · ${failed} failed this week`,
      status: stale ? "Degraded" : failed ? "Degraded" : "Operational",
    },
    {
      name: "Zoho CRM + Books",
      detail: `${lastSync ? `Last sync ${minutesAgo(lastSync, now)}` : "No sync yet"} · ${zohoPending} queued`,
      status: rejected ? "Degraded" : zohoPending ? "Syncing" : "Operational",
    },
    { name: "Cloudflare R2", detail: "Public CDN + private signed", status: h.dependencies.storage ? "Operational" : "Down" },
    { name: "Redis", detail: "Cache and rate limits only", status: h.dependencies.redis ? "Operational" : "Down" },
  ];
}

function minutesAgo(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
