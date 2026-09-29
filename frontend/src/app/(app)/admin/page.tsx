import Link from "next/link";

import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram } from "@/components/hero";
import {
  actionTotal,
  campaignLines,
  healthRows,
  queueCards,
  type ApiDeliveryHealth,
  type ApiIntegrationHealth,
  type ApiQueues,
} from "@/lib/ops-board-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { mayUse } from "@/lib/admin-access";

/* --------------------------------------------------------------------------
   Operations Board — P7-FE-06, §23. What needs BTG's action today, and every
   figure on it a live read (it used to be sample data behind a demo banner).

   Three reads, each optional by role: a queue the role doesn't read comes
   back null and has no card; delivery health and integration health answer
   403 to roles outside them, and that section is simply absent with a line
   saying why. Anything else non-OK throws to the error page — an outage
   never shows as stale or sample figures.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const STATUS_TONE = { Operational: "accent", Syncing: "primary", Degraded: "warn", Down: "danger" } as const;

async function read<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** How many live campaigns the board lists; the rest are one click away on
 *  the server-paged Campaigns desk (P2-FE-02 — no board renders every row). */
const BOARD_CAMPAIGNS = 8;

export default async function OperationsBoardPage() {
  const actor = await requirePortalAccess("admin");
  const [board, delivery, health] = await Promise.all([
    read<{ queues: ApiQueues }>("/operations/board"),
    read<{ campaigns: ApiDeliveryHealth[]; page: { total: number } }>(`/operations/delivery-health?page=1&size=${BOARD_CAMPAIGNS}`),
    read<ApiIntegrationHealth>("/operations/integration-health"),
  ]);

  /* A queue the role can READ but whose desk isn't theirs (C-1 — e.g. FINANCE
     reads deliverables, but Approvals is BTG's and campaign managers') isn't
     a card: "each card opens the page it counts", and that page would say
     "not in your role". */
  const cards = board ? queueCards(board.queues).filter((c) => mayUse(c.href, actor.roles)) : [];
  const campaigns = delivery ? campaignLines(delivery.campaigns) : null;
  const campaignTotal = delivery?.page.total ?? 0;
  const rows = health ? healthRows(health) : null;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operations Board</h1>
          <p className="mt-1 text-xs text-muted">What needs BTG’s action today. Every figure on this page is a live read.</p>
        </div>
        <p className="flex items-center gap-2 text-[11px] text-faint">
          <Badge tone="accent">POSTGRES</Badge> Read at {readAt}
        </p>
      </div>

      {board && (
        <section>
          <SectionHeading title={`Needs BTG action · ${actionTotal(cards)}`} hint="Each card opens the page it counts." />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <span className="flex items-baseline justify-between">
                    <span className="text-2xl font-semibold tabular-nums">{c.count}</span>
                    <span aria-hidden="true" className="text-muted">→</span>
                  </span>
                  <span className="text-sm font-semibold">{c.label}</span>
                  <span className="text-[11px] text-muted">{c.hint}</span>
                  {c.chips.length > 0 && (
                    <span className="mt-auto flex flex-wrap gap-1.5">
                      {c.chips.map((chip) => (
                        <Badge key={chip.text} tone={chip.tone}>
                          {chip.text}
                        </Badge>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section>
          <SectionHeading
            title={`Live campaigns${campaigns ? ` · ${campaignTotal}` : ""}`}
            action={
              <Link href="/admin/campaigns" className="text-xs text-primary hover:underline">
                All campaigns →
              </Link>
            }
          />
          {campaigns === null ? (
            <p className="text-xs text-faint">Delivery progress is outside your role.</p>
          ) : campaigns.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No live campaigns yet</p>
              <p className="mt-1 text-xs text-muted">
                A campaign goes live once a brief is matched and its athletes accept. Start with the first brief.
              </p>
              <Link href="/admin/briefs" className="mt-3 inline-block text-xs text-primary hover:underline">
                Open Briefs →
              </Link>
            </Card>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/campaigns/${encodeURIComponent(c.id)}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-primary/40"
                  >
                    <Monogram text={c.mono} tone="accent" className="size-9 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        {c.overdue > 0 && <Badge tone="warn">{c.overdue} overdue</Badge>}
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${c.due ? Math.round((c.done / c.due) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-[11px] text-muted">
                        {c.done} of {c.due} deliverables done · {c.ends}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading
            title="Integration health"
            action={
              <Link href="/admin/integrations" className="text-xs text-primary hover:underline">
                Integrations →
              </Link>
            }
          />
          {rows === null ? (
            <p className="text-xs text-faint">Integration health is BTG admin’s.</p>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{r.name}</span>
                      <span className="block truncate text-[11px] text-muted">{r.detail}</span>
                    </span>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line-soft px-4 py-2.5 text-[11px] text-faint">
                Zoho never sits on a request path — a queued sync is healthy, not an outage.
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
