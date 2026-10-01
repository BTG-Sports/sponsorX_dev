import Link from "next/link";

import { HandoffRequestCard } from "@/components/handoff-request-card";
import { HandoffStatusViews } from "@/components/handoff-status";
import { EmptyState, ErrorPanel, SkeletonPage } from "@/components/states";
import { BlockedNotice, Button } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { sampleHandoff, sampleSwitched } from "@/lib/guardian-live";
import { fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Guardian requests — 2S1-FE-10 (Claude Design GuardianHandoff.dc.html,
   "card", "confirm", "status"). The current guardian's side of a handoff:
   someone asking to take over as the minor's guardian. There is no separate
   guardian portal — a guardian signs in to the athlete portal (GUARDIAN,
   server/portal.ts), so the request lives here.

   The rules this screen shows (2S1-BE-15): a handoff starts only with the
   new guardian's request; only the current guardian answers it, with Hand
   off or Decline; they keep control until the switch; agreed work and
   earned money stay where they were; a dispute or custody question goes to
   BTG by hand (/contact), never through this page.

   SCAFFOLD — 2S1-BE-15 isn't built. When it is:
     Reads  GET  /guardian-handoffs?role=current        requests waiting on this guardian
     Writes POST /guardian-handoffs/:id/decision        HAND_OFF | DECLINE
   Until then: the sample request, both answers off. ?demo=status shows the
   handoff after it went through, as each of the three people sees it;
   ?demo=loading|empty|error the branded states.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Guardian requests" };

export default async function GuardianRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demo = await demoState(searchParams);
  const status = sp.demo === "status";
  const a = sampleHandoff.athlete.firstName;

  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") return <ErrorPanel />;

  /* Only the guardian answers. An athlete (or BTG previewing) still sees the
     sample, told plainly that on the live page the buttons aren't theirs. */
  const who = await fetchActor();
  const guardian = who.status === "linked" && who.actor.roles.includes("GUARDIAN");

  return (
    <div className="space-y-5">
      <BlockedNotice>
        Sample data — this page goes live with 2S1-BE-15 (changing a minor&rsquo;s guardian). Hand off and Decline don&rsquo;t send anything yet.
        {!guardian && " On the live page only the athlete’s current guardian sees these requests and can answer them."}
      </BlockedNotice>

      {status ? (
        <>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Guardian handoff · what each person sees</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The same three steps, on {sampleSwitched.requester.firstName}&rsquo;s request page, {sampleSwitched.current.firstName}&rsquo;s portal and {a}&rsquo;s
              athlete portal. Shown after {sampleSwitched.current.firstName} handed off and {sampleSwitched.requester.firstName}&rsquo;s documents were checked.
            </p>
          </div>
          <HandoffStatusViews
            request={sampleSwitched}
            cta={
              <Button disabled title="Sample — the new guardian sets up payouts once 2S1-BE-15 and 2S1-BE-11 are live.">
                Set up payouts on Stripe
              </Button>
            }
          />
          <Link href="/athlete/guardian-requests" className="inline-block text-xs font-medium text-primary-soft hover:underline">
            ← Back to the request
          </Link>
        </>
      ) : (
        <>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Guardian requests</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">Someone asking to take over as {a}&rsquo;s guardian.</p>
          </div>
          {demo === "empty" ? (
            <EmptyState
              mark="users"
              title="No guardian requests"
              hint={`If someone asks to become ${a}’s guardian, their request appears here for you to hand off or decline.`}
            />
          ) : (
            <HandoffRequestCard request={sampleHandoff} />
          )}
          <p className="text-xs text-faint">
            <Link href="/athlete/guardian-requests?demo=status" className="font-medium text-primary-soft hover:underline">
              See what each person sees once a handoff goes through →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
