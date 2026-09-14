import Link from "next/link";
import { Badge, BlockedNotice, Button, Card, StatTile } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  INVITE_COPY,
  athleteMinor,
  invitations,
  money,
  type InviteState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Invitations — §21, §13 step 5. Athlete portal. Redesigned
   2026-09-14: stat strip, free-text search (?q=, a plain GET form — the page
   stays a server component, no client JS), state tabs that preserve the
   query, and urgency-first sorting so what needs an answer sits on top.

   Lifecycle is INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED (§21).
   Viewing an invite is itself a state transition (INVITED → VIEWED) once
   wired — recorded server side, not here.

   Acceptance is blocked: the Campaign Order acceptance flow hashes the
   rendered agreement body, and that text must clear counsel first (guide
   §08). Fixtures only (src/lib/fixtures.ts).
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
  { key: "open", label: "Needs response", match: (s: InviteState) => s === "INVITED" || s === "VIEWED" },
  { key: "accepted", label: "Accepted", match: (s: InviteState) => s === "ACCEPTED" },
  { key: "declined", label: "Declined", match: (s: InviteState) => s === "DECLINED" },
  { key: "expired", label: "Expired", match: (s: InviteState) => s === "EXPIRED" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** Resolved order: open invites first (most urgent on top), then the
 *  paper trail — accepted, declined, expired. */
const STATE_ORDER: Record<InviteState, number> = {
  INVITED: 0,
  VIEWED: 0,
  ACCEPTED: 1,
  DECLINED: 2,
  EXPIRED: 3,
};

/** Rough time-to-expiry in hours, parsed from the fixture's relative string
 *  ("9 hours", "2 days") — good enough to sort and flag urgency. */
const urgencyHours = (s: string) => {
  const m = /(\d+)\s*(hour|day)/i.exec(s);
  if (!m) return Number.POSITIVE_INFINITY;
  return m[2].toLowerCase() === "day" ? Number(m[1]) * 24 : Number(m[1]);
};

const isOpen = (s: InviteState) => s === "INVITED" || s === "VIEWED";

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* Brand-new athlete: no invites at all — heading plus the single empty
     state, no counts, no tabs and no search pretending there is anything
     to filter. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campaign invitations
          </h1>
          <p className="mt-1 text-xs text-muted">
            When a sponsor invites you to a campaign, it lands here.
          </p>
        </div>
        <EmptyState
          mark="inbox"
          title="No invitations yet"
          hint="Your rate card is what sponsors see when they browse the marketplace — a complete one is how the first invitation arrives."
          action={{ label: "Review rate card", href: "/athlete" }}
        />
      </div>
    );
  }

  const sp = await searchParams;
  const stateParam = typeof sp.state === "string" ? sp.state : undefined;
  const active: FilterKey = FILTERS.some((f) => f.key === stateParam)
    ? (stateParam as FilterKey)
    : "all";
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const demoParam = typeof sp.demo === "string" ? sp.demo : undefined;

  /** Tab links keep the search query; the search form keeps the tab. */
  const href = (key: FilterKey, query: string) => {
    const p = new URLSearchParams();
    if (key !== "all") p.set("state", key);
    if (query) p.set("q", query);
    if (demoParam) p.set("demo", demoParam);
    const qs = p.toString();
    return `/athlete/invitations${qs ? `?${qs}` : ""}`;
  };
  const tabHref = (key: FilterKey) => href(key, q);
  const clearSearchHref = href(active, "");

  /* Search across everything a person would scan the list for: sponsor,
     campaign, job name and job ID. */
  const needle = q.toLowerCase();
  const searched = needle
    ? invitations.filter((i) =>
        [i.sponsor, i.campaign, i.jobName, i.jobId]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : invitations;

  const matcher = FILTERS.find((f) => f.key === active)!.match;
  const shown = searched
    .filter((i) => matcher(i.state))
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        urgencyHours(a.expiresIn) - urgencyHours(b.expiresIn),
    );

  /* Headline numbers cover the whole inbox, not the current filter — they
     answer "what's waiting for me" before any narrowing. */
  const openInvites = invitations.filter((i) => isOpen(i.state));
  const openValue = openInvites.reduce((s, i) => s + i.offered, 0);
  const mostUrgent = openInvites.length
    ? openInvites.reduce((a, b) =>
        urgencyHours(b.expiresIn) < urgencyHours(a.expiresIn) ? b : a,
      )
    : null;
  const resolved = invitations.filter((i) => !isOpen(i.state));
  const accepted = resolved.filter((i) => i.state === "ACCEPTED").length;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Campaign invitations
        </h1>
        <p className="mt-1 text-xs text-muted">
          Sponsors have invited you to these campaigns — review the terms and
          respond before an invitation expires.
        </p>
      </div>

      {demo === "minor" && (
        <BlockedNotice>
          Guardian authorization pending (§4) — invitations can be reviewed
          but not accepted until {athleteMinor.guardian.legalName} is
          verified.
        </BlockedNotice>
      )}

      {/* ------------------------------------------------------ stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Awaiting response"
          value={String(openInvites.length)}
          sub={`of ${invitations.length} total invitations`}
        />
        <StatTile
          label="Offers on the table"
          value={money(openValue)}
          sub="across open invitations"
        />
        <StatTile
          label="Next expiry"
          value={mostUrgent ? mostUrgent.expiresIn : "—"}
          sub={mostUrgent ? `${mostUrgent.sponsor} · ${money(mostUrgent.offered)}` : "nothing expiring"}
        />
        <StatTile
          label="Accepted"
          value={String(accepted)}
          sub={`of ${resolved.length} resolved`}
        />
      </div>

      {/* --------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {FILTERS.map((f) => {
            const count = searched.filter((i) => f.match(i.state)).length;
            return (
              <Link
                key={f.key}
                href={tabHref(f.key)}
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

        {/* Plain GET form — search works with zero client JS, and the URL
            stays shareable. Hidden inputs carry the active tab and demo
            state through the submit. */}
        <form
          action="/athlete/invitations"
          method="GET"
          role="search"
          className="relative w-full sm:w-64"
        >
          {active !== "all" && <input type="hidden" name="state" value={active} />}
          {demoParam && <input type="hidden" name="demo" value={demoParam} />}
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint">
            <SearchIcon />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search sponsor, campaign or job…"
            aria-label="Search invitations"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-athlete/50 focus-visible:ring-2 focus-visible:ring-athlete/30"
          />
        </form>
      </div>

      {/* Search-result summary with a one-click way back out. */}
      {q && (
        <p className="text-xs text-muted">
          {shown.length}{" "}
          {shown.length === 1 ? "invitation matches" : "invitations match"}{" "}
          <span className="font-semibold text-text">&ldquo;{q}&rdquo;</span>
          {" · "}
          <Link
            href={clearSearchHref}
            className="font-medium text-accent transition-colors hover:text-accent-soft"
          >
            Clear search
          </Link>
        </p>
      )}

      {/* ----------------------------------------------------------- list */}
      {shown.length === 0 ? (
        q ? (
          <EmptyState
            mark="inbox"
            title={`Nothing matches "${q}"`}
            hint="Try a sponsor name, a campaign, or a job ID like SX-03."
            action={{ label: "Clear search", href: clearSearchHref }}
          />
        ) : (
          <EmptyState
            mark="inbox"
            title="No invitations in this state"
            hint="Your rate card is what sponsors see when they browse the marketplace."
            action={{ label: "Review rate card", href: "/athlete" }}
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((inv, idx) => {
            const actionable = isOpen(inv.state);
            /* Anything inside a day gets the urgency treatment, not just
               the single most-urgent invite. */
            const urgent = actionable && urgencyHours(inv.expiresIn) <= 24;
            return (
              <div
                key={inv.id}
                className={`min-w-0 sx-animate sx-delay-${Math.min(idx + 1, 5)}`}
              >
                <Card
                  className={[
                    "flex h-full flex-col overflow-hidden p-0",
                    !actionable && "opacity-80",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* identity band — who is asking, in what state */}
                  <div className="flex items-center gap-3 bg-gradient-to-br from-athlete/15 to-transparent p-4">
                    <Monogram
                      text={initials(inv.sponsor)}
                      tone={actionable ? "primary" : "neutral"}
                      className="size-10 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-tight">
                        {inv.campaign}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {inv.sponsor}
                      </p>
                    </div>
                    <Badge tone={STATE_TONE[inv.state]}>
                      {INVITE_COPY[inv.state]}
                    </Badge>
                  </div>

                  {/* the numbers a decision is made on */}
                  <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {money(inv.offered)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">offered</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {inv.deliverableCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">
                        {inv.deliverableCount === 1 ? "deliverable" : "deliverables"}
                      </p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p
                        className={[
                          "text-sm font-semibold tracking-tight",
                          urgent ? "text-warn" : "tabular-nums",
                        ].join(" ")}
                      >
                        {actionable ? inv.expiresIn : "—"}
                      </p>
                      <p
                        className={`mt-0.5 text-[10px] ${urgent ? "text-warn" : "text-faint"}`}
                      >
                        {actionable ? "to respond" : inv.expiresIn}
                      </p>
                    </div>
                  </div>

                  {/* the job this invite is for */}
                  <div className="flex items-center gap-2 px-4 pt-3">
                    <Badge tone="neutral">{inv.jobId}</Badge>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                      {inv.jobName}
                    </span>
                    {urgent && <MiniChip kind="warn">URGENT</MiniChip>}
                  </div>

                  <dl className="space-y-1.5 px-4 pt-3 text-[11px]">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-faint">Usage rights</dt>
                      <dd className="min-w-0 truncate text-muted">
                        {inv.usageRights}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-faint">Exclusivity</dt>
                      <dd className="min-w-0 truncate text-muted">
                        {inv.exclusivity ?? "None"}
                      </dd>
                    </div>
                  </dl>

                  {inv.declineReason && (
                    <p className="mx-4 mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                      {inv.declineReason}
                    </p>
                  )}

                  {/* actions pinned to the bottom so every card lines up */}
                  <div className="mt-auto space-y-2 p-4 pt-3">
                    {actionable && (
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <Button
                            full
                            disabled
                            title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
                          >
                            Review &amp; accept
                          </Button>
                        </div>
                        <Button
                          variant="secondary"
                          title="Records the decline — a wireable transition, not wired in the fixture build"
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                    <Link
                      href={`/athlete/orders/${inv.id}?from=athlete-invitations`}
                      className="block text-center text-[11px] font-medium text-muted transition-colors hover:text-text"
                    >
                      Full terms →
                    </Link>
                  </div>
                </Card>
              </div>
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
