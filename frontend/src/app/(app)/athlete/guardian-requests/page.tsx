import Link from "next/link";

import { ArenaHead, ArenaUpdated, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { HandoffRequestCard } from "@/components/handoff-request-card";
import { HandoffStatusViews, HandoffTrack } from "@/components/handoff-status";
import { PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { EmptyState, ErrorPanel, SkeletonPage } from "@/components/states";
import { BlockedNotice, Button } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { handoffCounts, handoffGroupRows, handoffViews, sampleSwitched, type ApiHandoffList, type ApiHandoffRequest, type HandoffState } from "@/lib/guardian-live";
import { apiListQuery, pageOrAll } from "@/lib/list-query";
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

   P1-ART-22 (2026-10-11) — on the Arena, SERVER-PAGED (memory:
   pagination-pattern). Two reads of the one route:
     GET /guardian-handoffs?page=1&size=60&group=waiting   the bounded group, whole
     GET /guardian-handoffs?page&size&group=past           the house pager (?page / ?size)
   both answering { handoffs, page, counts: { waiting, past } }. The two
   plates are `counts`, never the rows. Until the backend lands the route
   answers everything unfiltered: handoffGroupRows cuts the group by state
   and handoffCounts counts it. The waiting requests are the guardian's
   HandoffRequestCards (Hand off / Decline) or, for the athlete, read-only
   plates; "Earlier requests" is the paged list of plates. The write, the
   ?demo=status preview and every action are unchanged.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Guardian requests" };
export const dynamic = "force-dynamic";

const PATH = "/athlete/guardian-requests";
const PAST_TONE: Partial<Record<HandoffState, ArenaTone>> = { SWITCHED: "win", HANDED_OFF: "blue", DECLINED: "ink", CANCELLED: "ink" };

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
        <ArenaHead
          title="Guardian handoff · what each person sees"
          pill="Preview · sample people"
          lede={`The same three steps, on ${s.requester.firstName}’s request page, ${s.current.firstName}’s portal and ${s.athlete.firstName}’s athlete portal — after ${s.current.firstName} handed off and ${s.requester.firstName}’s documents were checked.`}
        />
        <div className="sx-arena-in" style={at(0.12)}>
          <HandoffStatusViews request={s} cta={<Button disabled title="Preview — nothing is sent.">Set up payouts on Stripe</Button>} />
        </div>
        <Link href={PATH} className="inline-block text-xs font-medium text-athlete hover:underline">
          ← Back to your requests
        </Link>
      </div>
    );
  }

  const who = await fetchActor();
  const guardian = who.status === "linked" && who.actor.roles.includes("GUARDIAN");
  const [waitRes, pastRes] = demo === "empty"
    ? [null, null]
    : await Promise.all([
      /* The open group is bounded (one request per would-be guardian): one page of 60 holds it whole. */
      apiFetch("/guardian-handoffs?page=1&size=60&group=waiting"),
      apiFetch(`/guardian-handoffs${apiListQuery(sp, { group: "past" })}`),
    ]);
  /* A login that is neither a guardian nor an athlete (BTG previewing the portal) reads nothing here. */
  for (const r of [waitRes, pastRes]) if (r && !r.ok && r.status !== 403) throw new Error(`Guardian requests unavailable (${r.status}).`);
  const forbidden = Boolean(waitRes && waitRes.status === 403);
  const waitingList = waitRes?.ok ? ((await waitRes.json()) as ApiHandoffList) : null;
  const pastList = pastRes?.ok ? ((await pastRes.json()) as ApiHandoffList) : null;
  const waiting: ApiHandoffRequest[] = waitingList ? handoffGroupRows(waitingList, "waiting") : [];
  const past: ApiHandoffRequest[] = pastList ? handoffGroupRows(pastList, "past") : [];
  const counts = handoffCounts(waitingList, pastList);
  const pastPage = pageOrAll(past, pastList?.page);
  const seat = guardian ? 1 : 2; /* handoffViews: [new guardian, current guardian, athlete] */
  const now = new Date();
  const pill = <ArenaUpdated at={now} />;
  const nothing = counts.waiting === 0 && counts.past === 0 && waiting.length === 0 && past.length === 0;

  return (
    <div className="space-y-8">
      <ArenaHead
        title="Guardian requests"
        pill={pill}
        lede={guardian ? "Someone asking to take over as your athlete’s guardian. Only you can hand off or decline." : "Requests to become your guardian. Your guardian decides."}
      >
        <ArenaTiles cols={2}>
          <ArenaTile
            label="Waiting"
            value={counts.waiting}
            caption={counts.waiting ? (guardian ? "only you can hand off or decline" : "your guardian decides") : "no one is asking right now"}
            tone={counts.waiting ? "flare" : "ink"}
            delay={0.1}
          />
          <ArenaTile label="Past" value={counts.past} caption="handed off, declined or closed" tone={counts.past ? "blue" : "ink"} delay={0.16} />
        </ArenaTiles>
      </ArenaHead>

      {forbidden && (
        <ArenaPanel tone="ink" delay={0.24}>
          <p className="text-xs text-muted">Guardian requests are for an athlete&rsquo;s guardian and the athlete.</p>
        </ArenaPanel>
      )}

      {nothing ? (
        <EmptyState
          mark="users"
          title="No guardian requests"
          hint={guardian ? "If someone asks to become your athlete’s guardian, their request appears here for you to hand off or decline." : "If someone asks to become your guardian, you’ll see it here."}
        />
      ) : (
        <>
          {waiting.length > 0 && (
            <section aria-label={guardian ? "Requests waiting for your answer" : "Requests waiting for your guardian"} className="space-y-3">
              <ArenaSection title={`Waiting · ${counts.waiting}`} hint={guardian ? "Nothing changes until you answer." : "Your guardian still approves your agreements and payments."} delay={0.24} />
              {waiting.map((h, i) =>
                /* Only the guardian, and only on a request still WAITING for them, gets Hand off / Decline;
                   one already handed off (waiting for BTG's check) and every athlete read it as its status. */
                guardian && h.state === "WAITING" ? (
                  <div key={h.id} className="sx-arena-in" style={at(0.28 + i * 0.06)}>
                    <HandoffRequestCard request={h} decide={decideHandoffAction.bind(null, h.id)} />
                  </div>
                ) : (
                  <PastRequest key={h.id} h={h} seat={seat} delay={0.28 + i * 0.06} tone="flare" />
                ),
              )}
            </section>
          )}

          {(past.length > 0 || counts.past > 0) && (
            <section aria-labelledby="gr-past">
              <ArenaSection title={guardian ? "Earlier requests" : "Requests about you"} hint="Handed off, declined or closed — newest first." delay={0.34} />
              <h2 id="gr-past" className="sr-only">{guardian ? "Earlier requests" : "Requests about you"}</h2>
              <ServerList>
                <div className="space-y-3">
                  <PagerRow page={pastPage} noun="Requests" tone="athlete" position="top" />
                  <PendingList className="space-y-3">
                    {past.length === 0 ? (
                      <EmptyState mark="users" title="Nothing on this page" hint="The pager is past the last request — go back a page." />
                    ) : (
                      past.map((h, i) => <PastRequest key={h.id} h={h} seat={seat} delay={0.38 + i * 0.05} tone={PAST_TONE[h.state] ?? "ink"} />)
                    )}
                  </PendingList>
                  <PagerRow page={pastPage} noun="Requests" tone="athlete" position="bottom" />
                </div>
              </ServerList>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-faint">
        <Link href={`${PATH}?demo=status`} className="font-medium text-athlete hover:underline">
          See what each person sees once a handoff goes through →
        </Link>
      </p>
    </div>
  );
}

/** One request as this seat reads it: the headline, the three-step track, the line under it. */
function PastRequest({ h, seat, delay, tone }: { h: ApiHandoffRequest; seat: number; delay: number; tone: ArenaTone }) {
  const v = handoffViews(h)[seat]!;
  return (
    <ArenaPanel tone={tone} delay={delay} spot>
      <section aria-label={`Request from ${h.requester.name}`} className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold">{v.head}</p>
        <HandoffTrack request={h} />
        <p className="text-xs leading-relaxed text-muted">{v.foot}</p>
      </section>
    </ArenaPanel>
  );
}
