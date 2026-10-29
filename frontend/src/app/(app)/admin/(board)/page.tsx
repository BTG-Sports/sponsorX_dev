import {
  CampaignPanel,
  OpsHeader,
  OutsideRole,
  QueueDeck,
  ReviewPanel,
  StageHeading,
  StageLink,
  SystemsPanel,
} from "@/components/ops-stage";
import {
  actionTotal,
  BOARD_REVIEWS,
  campaignLines,
  healthRows,
  queueCards,
  reviewLines,
  type ApiDeliveryHealth,
  type ApiIntegrationHealth,
  type ApiQueues,
  type ApiReviewRow,
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

   Since 2026-10-05 (P1-ART-14) it is drawn on the "Mission Control" stage
   (components/ops-stage.tsx) — since P1-ART-18 the stage is the admin
   shell's, and this page is content on it: a dashboard header (title + KPI
   tiles) and the panels. The page lives in the (board) route group only so
   it can have its own dark loading screen; the URL is still /admin.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function read<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** How many live campaigns the board lists; the rest are one click away on
 *  the server-paged Campaigns desk (P2-FE-02 — no board renders every row). */
const BOARD_CAMPAIGNS = 5;

/* POL-FE-23 — BTG's own review queue (the desk's "review" tab, minus the
   sponsor's turn), longest wait first. The API's smallest page (12) is read
   and the board shows the first BOARD_REVIEWS by review-by date. */
const REVIEW_QUERY = "/deliverables?state=DRAFT_SUBMITTED,BTG_REVIEW&systemReturned=exclude&sort=waiting&page=1&size=12";

export default async function OperationsBoardPage() {
  const actor = await requirePortalAccess("admin");
  const [board, delivery, health, reviews] = await Promise.all([
    read<{ queues: ApiQueues }>("/operations/board"),
    read<{ campaigns: ApiDeliveryHealth[]; page: { total: number } }>(`/operations/delivery-health?page=1&size=${BOARD_CAMPAIGNS}`),
    read<ApiIntegrationHealth>("/operations/integration-health"),
    /* Only a role whose desk it is — the link must land on a page that is theirs. */
    mayUse("/admin/approvals", actor.roles)
      ? read<{ deliverables: ApiReviewRow[]; page: { total: number } }>(REVIEW_QUERY)
      : Promise.resolve(null),
  ]);

  /* A queue the role can READ but whose desk isn't theirs (C-1 — e.g. FINANCE
     reads deliverables, but Approvals is BTG's and campaign managers') isn't
     a card: "each card opens the page it counts", and that page would say
     "not in your role". */
  const mine = board ? queueCards(board.queues).filter((c) => mayUse(c.href, actor.roles)) : [];
  /* No card of its own and the role gets no queue section, ring or count —
     not an "all clear" it isn't in a position to give. */
  const cards = mine.length > 0 ? mine : null;
  const total = cards ? actionTotal(cards) : null;
  const campaigns = delivery ? campaignLines(delivery.campaigns) : null;
  const campaignTotal = delivery?.page.total ?? 0;
  const rows = health ? healthRows(health) : null;
  const now = new Date();
  const toReview = reviews ? reviewLines(reviews.deliverables, now, BOARD_REVIEWS) : null;
  const readAt = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <div>
        <OpsHeader cards={cards} total={total} campaignTotal={campaigns ? campaignTotal : null} rows={rows} readAt={readAt} />

        {cards && (
          <section className="mt-10">
            <StageHeading title="Needs BTG action" hint="Each card opens the page it counts." delay={0.5} />
            <QueueDeck cards={cards} />
          </section>
        )}

        {/* POL-FE-23 — the posts themselves, with their review-by dates; each
            link opens that post on the desk, not a list. */}
        {toReview && reviews && (
          <section className="mt-10">
            <StageHeading
              title={`Content to review${reviews.page.total ? ` · ${reviews.page.total}` : ""}`}
              hint="Soonest review-by first. Each line opens the post."
              action={<StageLink href="/admin/approvals">Approvals desk →</StageLink>}
              delay={0.7}
            />
            <ReviewPanel lines={toReview} total={reviews.page.total} allHref="/admin/approvals" />
          </section>
        )}

        <div className="mt-10 grid grid-cols-1 gap-x-3.5 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] [&>section]:min-w-0">
          <section>
            <StageHeading
              title={`Live campaigns${campaigns ? ` · ${campaignTotal}` : ""}`}
              action={mayUse("/admin/campaigns", actor.roles) && <StageLink href="/admin/campaigns">All campaigns →</StageLink>}
              delay={0.85}
            />
            {campaigns === null ? (
              <OutsideRole delay={0.9}>Delivery progress is outside your role.</OutsideRole>
            ) : (
              <CampaignPanel
                campaigns={campaigns}
                total={campaignTotal}
                allHref={mayUse("/admin/campaigns", actor.roles) ? "/admin/campaigns" : null}
                briefs={mayUse("/admin/briefs", actor.roles)}
              />
            )}
          </section>

          <section>
            <StageHeading
              title="Systems"
              action={mayUse("/admin/integrations", actor.roles) && <StageLink href="/admin/integrations">Integrations →</StageLink>}
              delay={0.9}
            />
            {rows === null ? (
              <OutsideRole delay={0.95}>Integration health is BTG admin’s.</OutsideRole>
            ) : (
              <SystemsPanel rows={rows} />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
