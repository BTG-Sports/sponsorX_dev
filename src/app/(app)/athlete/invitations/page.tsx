import Link from "next/link";
import { Badge, BlockedNotice, Button, Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  INVITE_COPY,
  invitations,
  money,
  type InviteState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Invitations — §21, §13 step 5. Athlete portal. Polished 2026-09-11.

   The full invite inbox behind the dashboard's "View all". Lifecycle is
   INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED (§21). Viewing an invite is
   itself a state transition (INVITED → VIEWED) once wired — recorded server
   side, not here.

   Acceptance is blocked: the Campaign Order acceptance flow hashes the
   rendered agreement body, and that text must clear counsel first (guide §08).
   Fixtures only (src/lib/fixtures.ts).
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<InviteState, "primary" | "accent" | "neutral" | "danger" | "warn"> = {
  INVITED: "primary",
  VIEWED: "warn",
  ACCEPTED: "accent",
  DECLINED: "neutral",
  EXPIRED: "danger",
};

const FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Open", match: (s: InviteState) => s === "INVITED" || s === "VIEWED" },
  { key: "accepted", label: "Accepted", match: (s: InviteState) => s === "ACCEPTED" },
  { key: "declined", label: "Declined", match: (s: InviteState) => s === "DECLINED" },
  { key: "expired", label: "Expired", match: (s: InviteState) => s === "EXPIRED" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** Rough time-to-expiry in hours, parsed from the fixture's relative string
 *  ("9 hours", "2 days") — good enough to pick the single most-urgent invite. */
const urgencyHours = (s: string) => {
  const m = /(\d+)\s*(hour|day)/i.exec(s);
  if (!m) return Number.POSITIVE_INFINITY;
  return m[2].toLowerCase() === "day" ? Number(m[1]) * 24 : Number(m[1]);
};

const inviteEmpty = (
  <EmptyState
    mark="inbox"
    title="No invitations in this state"
    hint="Your rate card is what sponsors see when they browse the marketplace."
    action={{ label: "Review rate card", href: "/athlete" }}
  />
);

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* Brand-new athlete: no invites at all — heading plus the single empty
     state, no counts and no tabs pretending there is anything to filter. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campaign invitations
          </h1>
          <p className="mt-1 text-xs text-muted">
            §21 — INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED.
          </p>
        </div>
        {inviteEmpty}
      </div>
    );
  }

  const sp = await searchParams;
  const stateParam = typeof sp.state === "string" ? sp.state : undefined;
  const active: FilterKey = FILTERS.some((f) => f.key === stateParam)
    ? (stateParam as FilterKey)
    : "all";
  const matcher = FILTERS.find((f) => f.key === active)!.match;
  const shown = invitations.filter((i) => matcher(i.state));

  const openInvites = invitations.filter(
    (i) => i.state === "INVITED" || i.state === "VIEWED",
  );
  const openValue = openInvites.reduce((s, i) => s + i.offered, 0);
  // Single most-urgent open invite — flagged with an urgency chip.
  const mostUrgentId = openInvites.length
    ? openInvites.reduce((a, b) =>
        urgencyHours(b.expiresIn) < urgencyHours(a.expiresIn) ? b : a,
      ).id
    : null;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Campaign invitations
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {openInvites.length} open ·
          <span className="font-semibold text-text">{money(openValue)}</span>
          in offers · respond before an invite expires. §21 — INVITED → VIEWED →
          ACCEPTED / DECLINED / EXPIRED.
        </p>
      </div>

      {/* ---------------------------------------------------------- filter */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {FILTERS.map((f) => {
          const count = invitations.filter((i) => f.match(i.state)).length;
          return (
            <Link
              key={f.key}
              href={`/athlete/invitations?state=${f.key}`}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                f.key === active
                  ? "bg-athlete/15 text-athlete"
                  : "text-muted hover:text-text",
              ].join(" ")}
            >
              {f.label}
              <span className="text-[10px] tabular-nums text-faint">{count}</span>
            </Link>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- list */}
      {shown.length === 0 ? (
        inviteEmpty
      ) : (
        <div className="space-y-3">
          {shown.map((inv) => {
            const actionable = inv.state === "INVITED" || inv.state === "VIEWED";
            const urgent = inv.id === mostUrgentId;
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tracking-tight">
                        {inv.campaign}
                      </span>
                      <Badge tone="neutral">{inv.jobId}</Badge>
                      <Badge tone={STATE_TONE[inv.state]}>
                        {INVITE_COPY[inv.state]}
                      </Badge>
                      {urgent && (
                        <MiniChip kind="warn">expires in {inv.expiresIn}</MiniChip>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {inv.sponsor} · {inv.jobName} · {inv.deliverableCount}{" "}
                      {inv.deliverableCount === 1 ? "deliverable" : "deliverables"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums leading-none">
                      {money(inv.offered)}
                    </p>
                    <p className="mt-1 text-[11px] text-faint">
                      {actionable ? `expires in ${inv.expiresIn}` : inv.expiresIn}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-line-soft pt-3 text-[11px] sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-faint">Usage rights</dt>
                    <dd className="text-muted">{inv.usageRights}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-faint">Exclusivity</dt>
                    <dd className="text-muted">{inv.exclusivity ?? "None"}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {actionable ? (
                    <>
                      <Button
                        disabled
                        title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
                      >
                        Review &amp; accept
                      </Button>
                      <Button variant="secondary">Decline</Button>
                    </>
                  ) : (
                    <Badge tone={STATE_TONE[inv.state]}>
                      {INVITE_COPY[inv.state]}
                    </Badge>
                  )}
                  <Link
                    href={`/athlete/orders/${inv.id}?from=athlete-invitations`}
                    className="text-xs text-muted transition-colors hover:text-text"
                  >
                    Full terms →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BlockedNotice>
        Accepting an invitation creates a Campaign Order and hashes the rendered
        agreement body (guide §08). Acceptance stays disabled until counsel
        approves the Campaign Order template. Viewing, declining and expiry are
        the wireable transitions; acceptance waits for B4.
      </BlockedNotice>
    </div>
  );
}
