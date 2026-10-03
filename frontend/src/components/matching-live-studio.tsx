"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MatchingStudio, type SendOutcome } from "@/components/matching-studio";
import { PagerRow, ServerList, useListNav } from "@/components/server-pager";
import { MIN_SCORE_FLOOR, type MatchAthlete, type MatchData, type MatchFilters, type MatchSort } from "@/lib/matching";
import { ATHLETE_KEYS, type ApiEligiblePage } from "@/lib/matching-live";
import type { PageInfo } from "@/lib/list-query";
import type { SendPick } from "@/app/(app)/admin/campaigns/match/actions";

/* --------------------------------------------------------------------------
   The Studio on a real brief (P4-FE-02 / -03). Only the send is new: picks
   become their per-line invitations, the server action sends them, and the
   page re-renders from Postgres so the roster reads each athlete's invite
   state rather than a local "sent" flag.

   SERVER-PAGED (2026-09-29). The roster is one page of GET
   /briefs/{id}/eligible-athletes; the Studio's filters and sort write the
   URL (?q ?sport ?tier ?min ?asort, the roster's own page keys ?apage
   ?asize — the brief picker above owns ?page ?size), and the page re-reads.
   Picks are held by athlete id inside the Studio, so they survive paging.
   -------------------------------------------------------------------------- */

export function LiveMatchingStudio(props: {
  data: MatchData;
  initial?: Partial<Record<"view" | "q" | "sport" | "tier" | "min", string>>;
  send: (picks: SendPick[]) => Promise<SendOutcome[]>;
  page: PageInfo;
  facets: ApiEligiblePage["facets"];
  sort: MatchSort;
}) {
  return (
    <ServerList>
      <Studio {...props} />
    </ServerList>
  );
}

function Studio({
  data,
  initial,
  send,
  page,
  facets,
  sort,
}: {
  data: MatchData;
  initial?: Partial<Record<"view" | "q" | "sport" | "tier" | "min", string>>;
  send: (picks: SendPick[]) => Promise<SendOutcome[]>;
  page: PageInfo;
  facets: ApiEligiblePage["facets"];
  sort: MatchSort;
}) {
  const router = useRouter();
  const { set } = useListNav();
  const onSend = async (athletes: MatchAthlete[]) => {
    const out = await send(
      athletes.map((a) => ({
        athleteId: a.id,
        lines: (a.lines ?? []).map((l) => ({ jobId: l.jobId, offered: l.offered })),
      })),
    );
    router.refresh();
    return out;
  };
  /* Stable across renders, so the Studio's debounce isn't reset by one — but
     always calling the LATEST `set`, which builds the next URL from the
     current one (a stale one would drop the picker's place). */
  const setRef = useRef(set);
  useEffect(() => {
    setRef.current = set;
  });
  const onQuery = useCallback(
    (f: MatchFilters, s: MatchSort) =>
      setRef.current(
        {
          q: f.q.trim() || null,
          sport: f.sport || null,
          tier: f.tier || null,
          min: f.minScore > MIN_SCORE_FLOOR ? f.minScore : null,
          /* P4-FE-08 — best match is the API's default; the rest by name. */
          asort: s === "match" ? null : s,
        },
        ATHLETE_KEYS,
      ),
    [],
  );
  return (
    <MatchingStudio
      data={data}
      initial={initial}
      onSend={onSend}
      server={{
        page,
        facets,
        sort,
        onQuery,
        pager: (position, filtered) => (
          <PagerRow page={page} noun="Athletes" tone="admin" position={position} filtered={filtered} keys={ATHLETE_KEYS} />
        ),
      }}
    />
  );
}
