/* --------------------------------------------------------------------------
   P7-FE-06 — the admin Operations Board, from three live reads:

     GET /operations/board             the four "needs BTG action" queues
                                       (null where the role doesn't read one)
     GET /operations/delivery-health   live campaigns, deliverables done / due
     GET /operations/integration-health  dependencies, Zoho, worker queue

   It replaced a board of sample figures (quarterly GMV, growth percentages,
   "median brief → match") that had no source; those are gone, not
   estimated. Every card links to the page whose count it shows.
   -------------------------------------------------------------------------- */

export type ApiQueues = {
  applications: { waiting: number; over48h: number } | null;
  approvals: { waiting: number } | null;
  briefs: { toQualify: number; toMatch: number } | null;
  finance: { held: number; disputed: number } | null;
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
  key: "applications" | "approvals" | "briefs" | "finance";
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
  return cards;
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
