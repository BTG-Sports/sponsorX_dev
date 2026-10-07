import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { IntakeHeader, StreamNote, StreamRows } from "@/components/intake-stage";
import { KindChips, ReviewToggle } from "@/components/intake-fx";
import { ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { SensitiveEdits } from "@/components/sensitive-edits-section";
import { demoState } from "@/lib/demo";
import type { PageInfo } from "@/lib/list-query";
import {
  STREAM_CHIPS, streamApiQuery, streamParams, streamRowView, type ApiStreamRow, type ApiStreamSummary, type StreamKind,
} from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   New sign-ups — 2S1-FE-07, redrawn as the "Intake Stream" (P1-ART-15,
   2026-10-05; spec docs/superpowers/specs/2026-10-05-new-signups-intake-
   stream-design.md). Everything SponsorX approved by itself; BTG steps in
   only for what is held under Needs review, and can reject (with an emailed
   reason) and reinstate on each sign-up's own page. Every automatic-approval
   email links here.

   One SERVER-PAGED stream of every kind (organisations, athletes, guardians,
   sponsors), newest first, on the admin board's Mission Control stage —
   the four separate sections it replaced each read their whole table. The
   URL holds `kind`, `review=1`, `q` and the house `page` / `size`; the old
   tabs' `?tab=` links still land on the same view (lib/new-signups-live.ts
   streamParams). Sensitive profile edits keep their own paged panel
   (`epage` / `esize`).

   Reads  GET /signups/stream?page&size&kind&review&q   one page of the stream
          GET /signups/stream/summary                   every figure on the page
          GET /profile-changes?page&size                sensitive edits (sensitive-edits-section.tsx)
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

  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const chips = STREAM_CHIPS.filter((c) => c.kind === "" || summary.kinds[c.kind as StreamKind]).map((c) => ({
    kind: c.kind,
    label: c.label,
    count: c.kind ? summary.kinds[c.kind as StreamKind]!.total : summary.all.total,
  }));
  const heldHere = filter.kind ? summary.kinds[filter.kind]?.held ?? 0 : summary.all.held;
  const filtered = Boolean(filter.kind || filter.review || filter.q);
  const showEdits = !refused && (filter.kind === "" || filter.kind === "ATHLETE" || filter.review);

  return (
    <>
      <div>
        <IntakeHeader summary={summary} readAt={readAt} />

        <ServerList>
          <section aria-label="Every sign-up" className="mt-8">

            {refused ? (
              <StreamNote>Your role doesn&rsquo;t read sign-ups, so none are shown here.</StreamNote>
            ) : (
              <>
                <div className="sx-ops-in mb-4 flex flex-col gap-3 xl:flex-row xl:items-center" style={{ "--sx-reveal-delay": "0.5s" } as React.CSSProperties}>
                  <KindChips chips={chips} value={filter.kind} />
                  <ReviewToggle on={filter.review} count={heldHere} />
                  <div className="xl:ml-auto xl:w-72">
                    <ListSearch initial={filter.q} label="Search sign-ups" placeholder="Search name, team, email…" tone="admin" />
                  </div>
                </div>

                {demo === "loading" ? (
                  <StreamNote>Loading the stream…</StreamNote>
                ) : !stream || stream.rows.length === 0 ? (
                  <StreamNote>
                    {filter.q
                      ? `No sign-ups match “${filter.q}”.`
                      : filter.review
                        ? "Nothing to review — every sign-up passed its checks."
                        : "No sign-ups yet. Organizations, athletes, guardians and sponsors appear here once their checks have run."}
                  </StreamNote>
                ) : (
                  <div className="space-y-3">
                    <PagerRow page={stream.page} noun="Sign-ups" tone="admin" position="top" filtered={filtered} />
                    <PendingList>
                      <StreamRows rows={stream.rows.map(streamRowView)} label="Sign-ups, newest first" />
                    </PendingList>
                    <PagerRow page={stream.page} noun="Sign-ups" tone="admin" position="bottom" />
                  </div>
                )}
              </>
            )}
          </section>

          {/* 2S1-FE-09 — sensitive profile edits (legal name, date of birth, guardian, a move across an age line). */}
          {showEdits && demo !== "loading" && demo !== "empty" && (
            <div className="mt-12">
              <SensitiveEdits searchParams={sp} />
            </div>
          )}
        </ServerList>
      </div>
    </>
  );
}
