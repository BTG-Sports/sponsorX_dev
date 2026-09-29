/* --------------------------------------------------------------------------
   The Operations Board's live reads — P2-FE-01, §23.

   Nothing new on the API: the board is a summary of reads each desk already
   makes — GET /campaigns (money + pacing), /applications, /deliverables,
   /briefs and /earnings (the work queues), /operations/integration-health and
   /audit-log. Staff roles see different slices (RBAC matrix), so each section
   is independent: a 403 is "not your role" and that section says so; any
   other failure is an error page, never sample data (QA pass 4 rule).
   -------------------------------------------------------------------------- */
import { apiFetch, fetchActor } from "@/server/api";
import { fetchCampaignSummary, type CampaignSummary } from "@/server/campaigns";

export const STAFF_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE"];

/** A capped list count: `more` when the API said there are further rows. */
export type Count = { n: number; more: boolean };

export type BoardHealth = {
  dependenciesDown: string[];
  outboxPending: number;
  oldestPending: string | null;
  webhooksRejected: number;
  jobsFailed: number;
};

export type BoardActivity = { id: string; at: string; action: string; entity: string; actor: string | null };

export type LiveBoard = {
  /** The viewer's roles — the board only links desks they can use (C-1). */
  roles: string[];
  /** DB aggregate over every campaign in scope (GET /campaigns/summary) —
   *  not a sum over a fetched list. Null when the role doesn't read campaigns. */
  summary: CampaignSummary | null;
  queues: {
    applications: Count | null;
    content: Count | null;
    briefs: Count | null;
    finance: Count | null;
  };
  health: BoardHealth | null;
  activity: BoardActivity[] | null;
};

/** The body, or null on a 403 (this role doesn't read it). */
async function read<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`${path.split("?")[0]} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

type Health = {
  dependencies: Record<string, boolean>;
  webhooks: { bySource: { rejected: number }[] };
  queue: {
    outboxPending: { count: number; oldest: string }[];
    recentFailed: unknown[];
  };
};

type Audit = {
  rows: { id: string; at: string; action: string; entity: string; actor: { email: string | null } | null }[];
};

export async function liveBoard(): Promise<LiveBoard | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => STAFF_ROLES.includes(r))) return null;

  /* Every queue count is a DATABASE count (2026-09-29): the desks' summary
     aggregates, or a paged list's `page.total` — never the length of a
     capped list, so the board no longer guesses "N+". */
  const [campaigns, apps, content, briefs, earnings, health, audit] = await Promise.all([
    fetchCampaignSummary(),
    read<{ summary: { waiting: number } }>("/applications/summary"),
    /* BTG's own review stages — SPONSOR_REVIEW is waiting on the sponsor. */
    read<{ states: Record<string, number> }>("/deliverables/summary"),
    read<{ page: { total: number } }>("/briefs?state=APPROVED&page=1&size=1"),
    read<{ byState: Record<string, { count: number }> }>("/earnings/summary"),
    read<Health>("/operations/integration-health"),
    read<Audit>("/audit-log?limit=8"),
  ]);
  const exact = (n: number): Count => ({ n, more: false });

  return {
    roles: who.actor.roles,
    summary: campaigns,
    queues: {
      applications: apps ? exact(apps.summary.waiting) : null,
      content: content ? exact((content.states.DRAFT_SUBMITTED ?? 0) + (content.states.BTG_REVIEW ?? 0)) : null,
      briefs: briefs ? exact(briefs.page.total) : null,
      finance: earnings
        ? exact((earnings.byState.HELD?.count ?? 0) + (earnings.byState.DISPUTED?.count ?? 0))
        : null,
    },
    health: health
      ? {
          dependenciesDown: Object.entries(health.dependencies).filter(([, ok]) => !ok).map(([k]) => k),
          outboxPending: health.queue.outboxPending.reduce((n, o) => n + o.count, 0),
          oldestPending:
            health.queue.outboxPending.map((o) => o.oldest).sort()[0] ?? null,
          webhooksRejected: health.webhooks.bySource.reduce((n, s) => n + s.rejected, 0),
          jobsFailed: health.queue.recentFailed.length,
        }
      : null,
    activity: audit
      ? audit.rows.map((r) => ({ id: r.id, at: r.at, action: r.action, entity: r.entity, actor: r.actor?.email ?? null }))
      : null,
  };
}
