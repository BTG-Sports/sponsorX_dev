/* --------------------------------------------------------------------------
   P7-FE-06 — the admin Operations Board, from three live reads:

     GET /operations/board             the "needs BTG action" queues — every
                                       queue that waits on BTG (POL-FE-15),
                                       null where the role doesn't read one,
                                       absent from an older API
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

/** The queues that are a plain `{ waiting, oldestSince }` (POL-BE-15). Each
 *  is null for a role that doesn't read it and absent from an older API. */
export type WaitingQueueKey =
  | "payouts"
  | "makeGoods"
  | "signups"
  | "organisations"
  | "sponsorRequests"
  | "guardianHandoffs"
  | "heldListings"
  | "heldOrders"
  | "deliveryIssues"
  | "offers"
  | "dealDisputes"
  | "refunds"
  | "heldClosures"
  | "reactivations"
  | "paymentDisputes"
  | "paymentEvents"
  | "profileChanges"
  | "campaignRequests";

export type ApiQueues = {
  /** `oldestSince` since POL-BE-15; an older API leaves it out. */
  applications: { waiting: number; over48h: number; oldestSince?: string | null } | null;
  /** No "since": a deliverable records no time it reached review. */
  approvals: { waiting: number } | null;
  briefs: { toQualify: number; toMatch: number; oldestSince?: string | null } | null;
  /** No "since": an earning records no time it was held or disputed. */
  finance: { held: number; disputed: number } | null;
} & Partial<Record<WaitingQueueKey, ApiWaitingQueue | null>>;

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
export type QueueKey = "applications" | "approvals" | "briefs" | "finance" | WaitingQueueKey;
export type QueueCard = {
  key: QueueKey;
  label: string;
  hint: string;
  count: number;
  /** The desk, possibly with a query or hash that opens the right tab —
   *  check access against `deskPath(href)`, never the whole string. */
  href: string;
  chips: { text: string; tone: Tone }[];
};

/* POL-FE-15 — every queue that waits on BTG is a card, each opening the
   desk (and tab) where the wait is cleared. Order here is the tie-break for
   the sort below: the loop's four first, then the rest as the API types
   them. A `hint` is one line on what the count is, not a figure. */
const WAITING_QUEUES: ReadonlyArray<{ key: WaitingQueueKey; label: string; hint: string; href: string }> = [
  /* POL-FE-12 — a held payout used to be silent: the payee read "BTG reviews
     it next" and nobody at BTG was counting. The desk's Waiting tab is the
     held ones; its Failed tab is what the provider handed back. */
  { key: "payouts", label: "Payouts to review", hint: "Held for BTG, or failed and handed back", href: "/admin/payouts" },
  { key: "makeGoods", label: "Make-goods to decide", hint: "Open make-goods waiting for a person", href: "/admin/intelligence/make-goods" },
  { key: "signups", label: "New sign-ups to review", hint: "Athletes, sponsors and organisations held for a person", href: "/admin/new-signups?review=1" },
  { key: "organisations", label: "Organisations to review", hint: "Waiting for verification on Onboarding", href: "/admin/onboarding" },
  { key: "sponsorRequests", label: "Sponsor requests", hint: "New requests nobody has answered", href: "/admin/sponsor-requests" },
  { key: "guardianHandoffs", label: "Guardian handoffs", hint: "Handed to BTG, or escalated after 7 days", href: "/admin/guardian-handoffs?tab=waiting" },
  { key: "heldListings", label: "Listings to approve", hint: "Marketplace listings held for approval", href: "/admin/marketplace?queue=listings" },
  { key: "heldOrders", label: "Orders to approve", hint: "Marketplace orders held for BTG, not the seller", href: "/admin/marketplace?queue=orders" },
  { key: "deliveryIssues", label: "Delivery issues", hint: "Delivery problems escalated to BTG", href: "/admin/delivery-issues" },
  { key: "offers", label: "Offers needing BTG", hint: "Drafts, and change requests nobody answered", href: "/admin/offers" },
  { key: "dealDisputes", label: "Deal disputes to decide", hint: "Documents are in; BTG decides", href: "/admin/deal-disputes?tab=documents" },
  { key: "refunds", label: "Refunds to send", hint: "Due and not yet sent", href: "/admin/refunds" },
  { key: "heldClosures", label: "Account closures held", hint: "Closures held for a person", href: "/admin/closed-accounts?tab=closing" },
  { key: "reactivations", label: "Reactivation requests", hint: "Closed accounts asking to come back", href: "/admin/closed-accounts" },
  { key: "paymentDisputes", label: "Payment disputes", hint: "Open with the payment provider", href: "/admin/payments/disputes" },
  { key: "paymentEvents", label: "Payment events for BTG", hint: "Held or failed, not yet resolved", href: "/admin/payments/events" },
  { key: "profileChanges", label: "ID and name changes", hint: "Sensitive edits BTG must answer", href: "/admin/new-signups#sensitive-edits" },
  /* P8-BE-12 — cancels and changes the automatic path held for a person. */
  { key: "campaignRequests", label: "Campaign requests", hint: "Cancels and changes held for BTG", href: "/admin/campaign-requests" },
];

/** The "oldest waiting since Oct 24" chip — only when something waits and
 *  the time is usable (a zero queue never shows a stale "since"). */
function oldestChip(waiting: number, oldestSince: string | null | undefined): QueueCard["chips"] {
  const since = waiting > 0 ? sinceDay(oldestSince) : null;
  return since ? [{ text: `oldest waiting since ${since}`, tone: "warn" }] : [];
}

/** The cards a role gets — only the queues it reads (null or absent is no
 *  card), oldest wait first; queues with nothing to date from keep their
 *  base order after those with one. */
export function queueCards(q: ApiQueues): QueueCard[] {
  const cards: { card: QueueCard; since: number }[] = [];
  /* The sort key: when the oldest started waiting, or never (sorts last).
     A zero queue has nothing waiting, whatever stale time it carries. */
  const push = (card: QueueCard, oldestSince: string | null | undefined) => {
    const t = card.count > 0 && oldestSince ? Date.parse(oldestSince) : Number.NaN;
    cards.push({ card, since: Number.isNaN(t) ? Number.POSITIVE_INFINITY : t });
  };
  if (q.applications) {
    push({
      key: "applications", label: "Athlete applications", hint: "Submitted or under review",
      count: q.applications.waiting, href: "/admin/applications",
      chips: [
        ...(q.applications.over48h ? [{ text: `${q.applications.over48h} over 48 hours`, tone: "warn" as const }] : []),
        ...oldestChip(q.applications.waiting, q.applications.oldestSince),
      ],
    }, q.applications.oldestSince);
  }
  if (q.approvals) {
    push({
      key: "approvals", label: "Content approvals", hint: "Deliverables awaiting a decision",
      count: q.approvals.waiting, href: "/admin/approvals", chips: [],
    }, null);
  }
  if (q.briefs) {
    const count = q.briefs.toQualify + q.briefs.toMatch;
    const chips: QueueCard["chips"] = [];
    if (q.briefs.toQualify) chips.push({ text: `${q.briefs.toQualify} to qualify`, tone: "warn" });
    if (q.briefs.toMatch) chips.push({ text: `${q.briefs.toMatch} to match`, tone: "primary" });
    chips.push(...oldestChip(count, q.briefs.oldestSince));
    push({ key: "briefs", label: "Briefs", hint: "Waiting to qualify or match", count, href: "/admin/briefs", chips }, q.briefs.oldestSince);
  }
  if (q.finance) {
    const chips: QueueCard["chips"] = [];
    if (q.finance.held) chips.push({ text: `${q.finance.held} held`, tone: "warn" });
    if (q.finance.disputed) chips.push({ text: `${q.finance.disputed} disputed`, tone: "danger" });
    push({
      key: "finance", label: "Finance", hint: "Earnings needing attention",
      count: q.finance.held + q.finance.disputed, href: "/admin/finance", chips,
    }, null);
  }
  for (const spec of WAITING_QUEUES) {
    const queue = q[spec.key];
    if (!queue) continue;
    push({ ...spec, count: queue.waiting, chips: oldestChip(queue.waiting, queue.oldestSince) }, queue.oldestSince);
  }
  return cards
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => a.since - b.since || a.i - b.i)
    .map((c) => c.card);
}

/** The path part of a card's href — `/admin/new-signups?review=1` and
 *  `/admin/new-signups#sensitive-edits` are both the New sign-ups desk, and
 *  the access map (lib/admin-access.ts) matches on the path alone. */
export function deskPath(href: string): string {
  return href.split(/[?#]/, 1)[0] ?? href;
}

/** "Oct 24" — the day the oldest started waiting, on the desk's clock
 *  (America/New_York, as review-by dates are); null without a usable time. */
export function sinceDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DESK_TIME_ZONE });
}

/** How many queues have something waiting. The board's headline figure —
 *  never a sum of the cards: one item can sit on two desks (a held sponsor
 *  sign-up is also a sponsor request; a waiting organisation counts under
 *  sign-ups and organisations), so a summed total would be wrong. */
export function queuesWaiting(cards: QueueCard[]): number {
  return cards.filter((c) => c.count > 0).length;
}

/* --------------------------------------------------------------------------
   P1-ART-14 — the "Mission Control" stage's pure pieces: the headline's
   words and the action ring's arcs. Both read only the queue cards above, so
   the stage shows no figure the board didn't already have.
   -------------------------------------------------------------------------- */

/** Each queue's hue on the stage — its ring arc and its card's foot strip.
 *  Fixed-dark literals (the --sx-on-media rule): the stage is dark in both
 *  themes. The loop's four are blue then orange, the lockup's split; the
 *  POL-FE-15 queues fan out from there, each a hue of its own so the ring's
 *  legend and the cards' foot strips read apart at 22. */
export const QUEUE_TONE: Record<QueueKey, string> = {
  applications: "#2e9bf5",
  approvals: "#9be0ff",
  briefs: "#fb923c",
  finance: "#f97a1f",
  /* POL-FE-12 — amber, so money waiting for a person reads apart from the
     two oranges beside it. */
  payouts: "#ffb020",
  makeGoods: "#fde047",
  signups: "#22d3ee",
  organisations: "#14b8a6",
  sponsorRequests: "#4ade80",
  guardianHandoffs: "#a3e635",
  heldListings: "#818cf8",
  heldOrders: "#a78bfa",
  deliveryIssues: "#f472b6",
  offers: "#c084fc",
  dealDisputes: "#fb7185",
  refunds: "#e879f9",
  heldClosures: "#94a3b8",
  reactivations: "#fca5a5",
  paymentDisputes: "#ef4444",
  paymentEvents: "#86efac",
  profileChanges: "#f5d0a9",
  campaignRequests: "#e2e8f0",
};

export type BoardHeadline = { lead: string; hand: string; tail: string };

/** "7 queues need / BTG's hand today." — the count of queues with something
 *  waiting, never of items (see `queuesWaiting`); `null` when the role reads
 *  no queue. */
export function boardHeadline(waiting: number | null): BoardHeadline {
  const hand = "BTG’s hand";
  if (waiting === null) return { lead: "Operations,", hand: "live", tail: "today." };
  if (waiting === 0) return { lead: "Nothing needs", hand, tail: "right now." };
  const n = waiting.toLocaleString("en-US");
  return { lead: waiting === 1 ? `${n} queue needs` : `${n} queues need`, hand, tail: "today." };
}

export type RingSegment = { key: QueueKey; len: number; offset: number; color: string };

/** One arc per queue with work, all the same size, `gap` apart — the ring
 *  shows WHICH queues wait, not how much, because the cards don't add up
 *  (see `queuesWaiting`). `offset` is where the arc starts along the circle
 *  (for stroke-dashoffset). A lone queue closes the circle with no gap;
 *  nothing waiting draws nothing. The gap shrinks before an arc can vanish,
 *  so 22 queues still draw 22 arcs. */
export function ringSegments(cards: QueueCard[], circumference: number, gap: number): RingSegment[] {
  const live = cards.filter((c) => c.count > 0);
  if (live.length === 0) return [];
  if (live.length === 1) {
    const c = live[0]!;
    return [{ key: c.key, len: circumference, offset: 0, color: QUEUE_TONE[c.key] }];
  }
  const share = circumference / live.length;
  const g = Math.min(gap, share / 2);
  return live.map((c, i) => ({ key: c.key, len: share - g, offset: i * share, color: QUEUE_TONE[c.key] }));
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
