import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PropertyChanges } from "@/components/property-changes-section";
import { SensitiveEdits } from "@/components/sensitive-edits-section";
import { ServerList } from "@/components/server-pager";
import { SignupStats, SignupsHeader, StreamNote } from "@/components/signup-stage";
import { SignupsDesk } from "@/components/signups-desk";
import { demoState } from "@/lib/demo";
import type { PageInfo } from "@/lib/list-query";
import {
  STREAM_CHIPS, streamApiQuery, streamParams, streamRowView, type ApiStreamRow, type ApiStreamSummary, type StreamKind,
} from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";

import "../../applications/(queue)/applications.css";
import "./signups.css";

/* --------------------------------------------------------------------------
   New sign-ups — 2S1-FE-07. Everything SponsorX approved by itself; BTG steps
   in only for what is held under Needs review, and can reject (with an
   emailed reason) and reinstate on each sign-up's own page. Every
   automatic-approval email links here.

   One SERVER-PAGED stream of every kind (organisations, athletes, guardians,
   sponsors), newest first, on the admin shell's Mission Control stage
   (P1-ART-15, 2026-10-05, the "Intake Stream").

   POL-FE-109 (2026-11-17) — redrawn like the athlete's Inventory and
   Listings, as /admin/applications was that morning (POL-FE-106). The owner:
   "do what we did in listing and inventory … easy to understand … don't
   remove the current theme … add loaders and how it works". Top to bottom:
     1. the title, a live pill, "How it works" (the five steps in a panel)
        and "Sign-up rules"; one line on what the page is for;
     2. four status cards, numbers only: Needs review, Approved
        automatically, All sign-ups, Who signed up (a bar per kind);
     3. the list, and nothing else: two tabs (All sign-ups / Needs review),
        List ↔ Cards, search, the kind as a dropdown; per sign-up who, kind,
        day, a status pill with why, and Review (held) or Open;
     4. sensitive profile edits (2S1-FE-09), as before, in their own paged
        list (`epage` / `esize`).
   POL-FE-104 (2026-11-20) adds, between 3 and 4 and only when one waits, an
   organisation's name, place or details change that a safety check held
   for BTG (property-changes-section.tsx), with Approve / Reject.
   Visual only: the reads, the URL (`kind`, `review=1`, `q`, `page`, `size`;
   the old `?tab=` links still land on the same view — lib/new-signups-live.ts
   streamParams) and every link are unchanged.

   Loaders: ./loading.tsx on arrival; inside the page each list swaps to its
   skeleton while its own re-fetch runs (the stream and the edits each sit in
   their own <ServerList>, so paging one never blanks the other).

   Reads  GET /signups/stream?page&size&kind&review&q   one page of the stream
          GET /signups/stream/summary                   every figure on the page
          GET /profile-changes?page&size                sensitive edits (sensitive-edits-section.tsx)
          GET /property-profile-changes                 held organisation changes (property-changes-section.tsx)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";
const TITLE = "New sign-ups";

export default async function NewSignupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demo = await demoState(searchParams);
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const filter = streamParams(sp);
  const [streamRes, summaryRes] = demo === "loading" || demo === "empty"
    ? [null, null]
    : await Promise.all([apiFetch(`/signups/stream${streamApiQuery(sp)}`), apiFetch("/signups/stream/summary")]);

  /* An outage is the error page's (never a stale or sample stream); a role
     the API refuses gets the one line that says so. */
  for (const res of [streamRes, summaryRes]) {
    if (res && !res.ok && res.status !== 403) throw new Error(`New sign-ups unavailable (${res.status}).`);
  }
  const refused = streamRes?.status === 403 || summaryRes?.status === 403;
  const summary: ApiStreamSummary = summaryRes?.ok
    ? ((await summaryRes.json()) as ApiStreamSummary)
    : { kinds: {}, all: { total: 0, held: 0, auto: 0 } };
  const stream = streamRes?.ok ? ((await streamRes.json()) as { rows: ApiStreamRow[]; page: PageInfo }) : null;

  const readAt = streamRes ? new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  /* The dropdown offers the kinds this role reads (the summary's), in the desk's order. */
  const kinds = STREAM_CHIPS.filter((c) => c.kind !== "" && summary.kinds[c.kind as StreamKind]).map((c) => ({ value: c.kind, label: c.label }));
  const showEdits = !refused && (filter.kind === "" || filter.kind === "ATHLETE" || filter.review);

  return (
    <>
      <SignupsHeader readAt={readAt} />

      {refused ? (
        <StreamNote>Your role doesn&rsquo;t read sign-ups, so none are shown here.</StreamNote>
      ) : (
        <>
          {demo === "loading" ? (
            <div aria-hidden="true" className="sx-ap-stats mt-6">
              {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[7.75rem]" />)}
            </div>
          ) : (
            <SignupStats summary={summary} />
          )}

          <ServerList>
            <section aria-label="Every sign-up">
              <SignupsDesk
                rows={(stream?.rows ?? []).map(streamRowView)}
                page={stream?.page ?? null}
                filter={filter}
                kinds={kinds}
                held={summary.all.held}
                forceLoading={demo === "loading"}
              />
            </section>
          </ServerList>
        </>
      )}

      {/* POL-FE-104 — an organisation's name, place or details change that a safety check held for BTG; drawn only when one waits. */}
      {!refused && demo === null && (
        <div className="mt-12 empty:hidden">
          <PropertyChanges />
        </div>
      )}

      {/* 2S1-FE-09 — sensitive profile edits (legal name, date of birth, guardian, a move across an age line). */}
      {showEdits && demo !== "loading" && demo !== "empty" && (
        <ServerList>
          <div className="mt-12">
            <SensitiveEdits searchParams={sp} />
          </div>
        </ServerList>
      )}
    </>
  );
}
