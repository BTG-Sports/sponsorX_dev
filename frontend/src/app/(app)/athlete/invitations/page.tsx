import { BlockedNotice, StatTile } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
import { InvitationsInbox, type InboxInitial } from "@/components/invitations-inbox";
import { demoState } from "@/lib/demo";
import { athleteMinor, invitations, money } from "@/lib/fixtures";
import { isOpen } from "@/lib/invitations-ui";
import {
  fixtureInboxRow,
  inboxApiQuery,
  INBOX_SORTS,
  INBOX_TABS,
  nextExpiryLabel,
  toInboxRow,
  type ApiInvitationPage,
  type ApiInvitationSummary,
  type InboxRow,
} from "@/lib/invitations-live";
import { textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { respondToInvite } from "./actions";

/* --------------------------------------------------------------------------
   Campaign Invitations — §21, §13 step 5. Athlete portal. Reworked
   2026-09-16: the list is now a client island (invitations-inbox) with
   instant search, state tabs, a job filter, a sort menu, dismissible chips
   and page-size + numbered pagination, all URL-synced via replaceState so a
   filtered view is shareable. This page keeps the server-rendered frame:
   heading, demo states, guardian notice and the whole-inbox stat strip.

   Lifecycle is INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED (§21).
   Viewing an invite is itself a state transition (INVITED → VIEWED) once
   wired — recorded server side, not here.

   Acceptance is blocked: the Campaign Order acceptance flow hashes the
   rendered agreement body, and that text must clear counsel first (guide
   §08).

   LIVE vs DEMO (P4-FE-04, the P3-FE-02 precedent). A signed-in athlete sees
   their REAL inbox — GET /invitations, own scope, all five §21 states — and
   the cards answer through the respondToInvite server action: opening
   records INVITED→VIEWED, then accept or decline. Accepting an INVITATION is
   not signing: the Campaign Order BTG drafts afterwards is what gets hashed
   (P5-FE-01), so the counsel block on order acceptance does not apply here.
   Anyone else, or any ?demo= state, keeps the fixture demo.
   -------------------------------------------------------------------------- */

/* SERVER-PAGED (2026-09-29). The live inbox is ONE page of GET
   /invitations (?state tab, ?job, ?q, ?sort, ?page, ?size — filtered,
   ordered, counted and paged in the database) plus GET
   /invitations/summary for the stat strip, which covers the whole inbox,
   not the current filter. "Open" is the API's: answerable and not past its
   expiry; a lapsed invite the sweep hasn't reached counts as expired. */
type LiveInbox = { list: ApiInvitationPage; summary: ApiInvitationSummary };

/** The signed-in athlete's real inbox page, or null for the demo. */
async function liveInbox(sp: SearchParams): Promise<LiveInbox | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     athlete's own offers (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.includes("ATHLETE")) return null;

  const [res, sum] = await Promise.all([
    apiFetch(`/invitations${inboxApiQuery(sp)}`),
    apiFetch("/invitations/summary"),
  ]);
  if (!res.ok) throw new Error(`Invitations unavailable (${res.status}).`);
  if (!sum.ok) throw new Error(`Invitation summary unavailable (${sum.status}).`);
  return {
    list: (await res.json()) as ApiInvitationPage,
    summary: ((await sum.json()) as { summary: ApiInvitationSummary }).summary,
  };
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const live = demo === null ? await liveInbox(sp) : null;
  const now = new Date();
  const rows: InboxRow[] = live
    ? live.list.invitations.map((r) => toInboxRow(r, now))
    : invitations.map(fixtureInboxRow);

  /* Brand-new athlete: no invites at all — heading plus the single empty
     state, no counts, no tabs and no search pretending there is anything
     to filter. A live athlete with an empty inbox gets the same page. */
  if (demo === "empty" || (live && live.summary.total === 0)) {
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

  /* Flatten to string-only params for the client island to seed from, and
     preserve the demo param across its URL syncs. */
  const demoParam = typeof sp.demo === "string" ? sp.demo : undefined;
  const initial: InboxInitial = Object.fromEntries(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [
      string,
      string,
    ][],
  );

  /* Headline numbers cover the whole inbox, not the current filter — they
     answer "what's waiting for me" before any narrowing. */
  const stats = live
    ? {
        open: live.summary.open,
        total: live.summary.total,
        openValue: live.summary.openValue,
        next: live.summary.nextExpiry
          ? {
              in: nextExpiryLabel(live.summary, now) ?? "—",
              sub: `${live.summary.nextExpiry.sponsorName ?? "BTG"} · ${money(live.summary.nextExpiry.offered)}`,
            }
          : null,
        accepted: live.summary.accepted,
        resolved: live.summary.resolved,
      }
    : fixtureStats(rows);

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

      {/* C-2 (check pass): a signed-in non-athlete here — a guardian, or staff
          previewing — gets the sample inbox, so say so; it must never read as
          their own. (Signed-out visitors can't reach this portal.) */}
      {!demo && !live && (
        <BlockedNotice>
          Demo data — this is a sample inbox, not a real one. Invitations are
          answered by the athlete; a guardian view of them isn&rsquo;t built yet.
        </BlockedNotice>
      )}

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
          value={String(stats.open)}
          sub={`of ${stats.total} total invitations`}
        />
        <StatTile
          label="Offers on the table"
          value={money(stats.openValue)}
          sub="across open invitations"
        />
        <StatTile
          label="Next expiry"
          value={stats.next ? stats.next.in : "—"}
          sub={stats.next ? stats.next.sub : "nothing expiring"}
        />
        <StatTile
          label="Accepted"
          value={String(stats.accepted)}
          sub={`of ${stats.resolved} resolved`}
        />
      </div>

      {/* --------------------------------------------------- inbox (island) */}
      <InvitationsInbox
        rows={rows}
        initial={initial}
        demoParam={demoParam}
        respond={live ? respondToInvite : undefined}
        server={
          live
            ? {
                page: live.list.page,
                counts: live.list.counts,
                jobs: live.summary.jobs.map((j) => ({ value: j.jobId, label: `${j.jobId} · ${j.jobName}` })),
                q: textParam(sp, "q"),
                tab: (textParam(sp, "state", INBOX_TABS) || "all") as "all" | (typeof INBOX_TABS)[number],
                job: textParam(sp, "job"),
                sort: textParam(sp, "sort", INBOX_SORTS),
              }
            : undefined
        }
      />

      {!live && <BlockedNotice>
        Accepting an invitation creates a Campaign Order and hashes the rendered
        agreement body (guide §08). Acceptance stays disabled until counsel
        approves the Campaign Order template. Viewing, declining and expiry are
        the wireable transitions; acceptance waits for B4.
      </BlockedNotice>}
    </div>
  );
}

/** The demo's stat strip, from the fixture rows in hand. */
function fixtureStats(rows: InboxRow[]) {
  const openInvites = rows.filter((i) => isOpen(i.state));
  const mostUrgent = openInvites.length
    ? openInvites.reduce((a, b) => (b.hoursLeft < a.hoursLeft ? b : a))
    : null;
  const resolved = rows.filter((i) => !isOpen(i.state));
  return {
    open: openInvites.length,
    total: rows.length,
    openValue: openInvites.reduce((s, i) => s + i.offered, 0),
    next: mostUrgent ? { in: mostUrgent.expiresIn, sub: `${mostUrgent.sponsor} · ${money(mostUrgent.offered)}` } : null,
    accepted: resolved.filter((i) => i.state === "ACCEPTED").length,
    resolved: resolved.length,
  };
}
