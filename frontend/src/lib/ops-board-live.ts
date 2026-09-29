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
      key: "approvals", label: "Content approvals", hint: "Deliverables awaiting BTG review",
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

export type CampaignLine = {
  id: string;
  name: string;
  mono: string;
  done: number;
  due: number;
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
