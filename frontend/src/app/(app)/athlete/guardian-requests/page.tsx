import Link from "next/link";

import { HandoffRequestCard } from "@/components/handoff-request-card";
import { HandoffStatusViews, HandoffTrack } from "@/components/handoff-status";
import { EmptyState, ErrorPanel, SkeletonPage } from "@/components/states";
import { BlockedNotice, Button } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { handoffViews, sampleSwitched, type ApiHandoffRequest } from "@/lib/guardian-live";
import { apiFetch, fetchActor } from "@/server/api";
import { decideHandoffAction } from "./actions";

/* --------------------------------------------------------------------------
   Guardian requests — 2S1-FE-10 (Claude Design GuardianHandoff.dc.html,
   "card", "confirm", "status"). The current guardian's side of a handoff:
   someone asking to take over as the minor's guardian. There is no separate
   guardian portal — a guardian signs in to the athlete portal (GUARDIAN,
   server/portal.ts), so the request lives here. The athlete sees the same
   requests about them, read-only.

   The rules this screen shows (2S1-BE-15): a handoff starts only with the
   new guardian's request; only the current guardian answers it, with Hand
   off or Decline; they keep control until the switch; agreed work and
   earned money stay where they were; a dispute or custody question goes to
   BTG by hand (/contact), never through this page.

   LIVE:
     Reads  GET  /guardian-handoffs                 requests made of this guardian, or about this athlete
     Writes POST /guardian-handoffs/:id/decision    HAND_OFF | DECLINE (actions.ts; current guardian only)
   ?demo=status shows a handoff after it went through, as each of the three
   people sees it (sample people); ?demo=loading|empty|error the branded states.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Guardian requests" };
export const dynamic = "force-dynamic";

export default async function GuardianRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demo = await demoState(searchParams);

  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") return <ErrorPanel />;

  if (sp.demo === "status") {
    const s = sampleSwitched;
    return (
      <div className="space-y-5">
        <BlockedNotice>Preview with sample people — nothing here is sent.</BlockedNotice>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Guardian handoff · what each person sees</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The same three steps, on {s.requester.firstName}&rsquo;s request page, {s.current.firstName}&rsquo;s portal and {s.athlete.firstName}&rsquo;s athlete
            portal. Shown after {s.current.firstName} handed off and {s.requester.firstName}&rsquo;s documents were checked.
          </p>
        </div>
        <HandoffStatusViews request={s} cta={<Button disabled title="Preview — nothing is sent.">Set up payouts on Stripe</Button>} />
        <Link href="/athlete/guardian-requests" className="inline-block text-xs font-medium text-primary-soft hover:underline">
          ← Back to your requests
        </Link>
      </div>
    );
  }

  const who = await fetchActor();
  const guardian = who.status === "linked" && who.actor.roles.includes("GUARDIAN");
  const res = demo === "empty" ? null : await apiFetch("/guardian-handoffs");
  /* A login that is neither a guardian nor an athlete (BTG previewing the portal) reads nothing here. */
  if (res && !res.ok && res.status !== 403) throw new Error(`Guardian requests unavailable (${res.status}).`);
  const handoffs = res?.ok ? ((await res.json()) as { handoffs: ApiHandoffRequest[] }).handoffs : [];
  /* Only the guardian gets the card with Hand off / Decline; the athlete reads every request as its status. */
  const waiting = guardian ? handoffs.filter((h) => h.state === "WAITING") : [];
  const past = handoffs.filter((h) => !waiting.includes(h));
  const seat = guardian ? 1 : 2; /* handoffViews: [new guardian, current guardian, athlete] */

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Guardian requests</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {guardian ? "Someone asking to take over as your athlete’s guardian. Only you can hand off or decline." : "Requests to become your guardian. Your guardian decides."}
        </p>
      </div>

      {res && res.status === 403 && (
        <p className="rounded-lg border border-line bg-surface px-3.5 py-3 text-xs text-muted">Guardian requests are for an athlete&rsquo;s guardian and the athlete.</p>
      )}

      {handoffs.length === 0 ? (
        <EmptyState
          mark="users"
          title="No guardian requests"
          hint={guardian ? "If someone asks to become your athlete’s guardian, their request appears here for you to hand off or decline." : "If someone asks to become your guardian, you’ll see it here."}
        />
      ) : (
        <>
          {waiting.map((h) => (
            <HandoffRequestCard key={h.id} request={h} decide={decideHandoffAction.bind(null, h.id)} />
          ))}
          {past.length > 0 && (
            <section aria-labelledby="gr-past" className="space-y-3">
              <h2 id="gr-past" className="text-sm font-semibold">{guardian ? "Earlier requests" : "Requests about you"}</h2>
              {past.map((h) => {
                const v = handoffViews(h)[seat]!;
                return (
                  <section key={h.id} aria-label={`Request from ${h.requester.name}`} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
                    <p className="text-sm font-semibold">{v.head}</p>
                    <HandoffTrack request={h} />
                    <p className="text-xs leading-relaxed text-muted">{v.foot}</p>
                  </section>
                );
              })}
            </section>
          )}
        </>
      )}

      <p className="text-xs text-faint">
        <Link href="/athlete/guardian-requests?demo=status" className="font-medium text-primary-soft hover:underline">
          See what each person sees once a handoff goes through →
        </Link>
      </p>
    </div>
  );
}
