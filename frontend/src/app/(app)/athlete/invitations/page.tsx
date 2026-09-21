import { BlockedNotice, StatTile } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
import { InvitationsInbox, type InboxInitial } from "@/components/invitations-inbox";
import { demoState } from "@/lib/demo";
import { athleteMinor, invitations, money } from "@/lib/fixtures";
import { isOpen, urgencyHours } from "@/lib/invitations-ui";

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
   §08). Fixtures only (src/lib/fixtures.ts).
   -------------------------------------------------------------------------- */

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

  /* Flatten to string-only params for the client island to seed from, and
     preserve the demo param across its URL syncs. */
  const sp = await searchParams;
  const demoParam = typeof sp.demo === "string" ? sp.demo : undefined;
  const initial: InboxInitial = Object.fromEntries(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [
      string,
      string,
    ][],
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

      {/* --------------------------------------------------- inbox (island) */}
      <InvitationsInbox initial={initial} demoParam={demoParam} />

      <BlockedNotice>
        Accepting an invitation creates a Campaign Order and hashes the rendered
        agreement body (guide §08). Acceptance stays disabled until counsel
        approves the Campaign Order template. Viewing, declining and expiry are
        the wireable transitions; acceptance waits for B4.
      </BlockedNotice>
    </div>
  );
}
