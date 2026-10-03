import { BlockedNotice, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { ApprovalsDesk, ApprovalsDeskServer } from "@/components/approvals-desk";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { AGING_HOURS, PIPELINE_STEPS } from "@/lib/approvals-ui";
import {
  DESK_SUMMARY_QUERY,
  deskFilters,
  deskHeadline,
  deskListQuery,
  toDeskItem,
  type DeskSummary,
} from "@/lib/approvals-live";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import { pageParams, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { approvalAction, artworkAction, artworkLink, assetLink } from "./actions";
import { ArtworkQueue } from "@/components/edition-artwork";
import type { ApiArtwork } from "@/lib/edition-artwork-live";
import { requestTime } from "../next/live";
import {
  adminApprovalsX,
  contentCleared,
  contentReviewQueue,
} from "@/lib/fixtures";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

/* --------------------------------------------------------------------------
   Content Approval Workspace — §10, deliverable pipeline §21.
   Redesigned 2026-09-16 (same UX feedback as the applications desk: the old
   page was a flat card dump with dead buttons and spec jargon in the copy).

   The page now works like a desk: a hero band answers "how is the queue
   doing" (awaiting count, aging alert, review pace) and teaches the §21
   pipeline as four desks with live counts; the queue itself is the
   ApprovalsDesk client island — tabs, instant search and filters, and a
   slide-over review drawer where the signed-asset preview, the stage tracker
   and the decision bar live. Advance / Request revision walk the real state
   machine locally ("this visit only") until B5 wires the backend.

   Creative assets live in the PRIVATE R2 bucket and are only ever reached
   through short-lived signed URLs — never public (guide §11). The preview in
   the drawer is a placeholder standing in for that signed fetch.

   LIVE vs DEMO (P5-FE-04, the P3-FE-02 precedent). A signed-in BTG content
   desk sees the REAL pipeline — GET /deliverables in the tenant scope — and
   the drawer's decision bar walks the real §21 machine through the
   approvalAction server function: start BTG review, send to sponsor,
   approve, request revision (reason required, sent to the athlete), and
   verify a published post against its link (the publication proof).
   "Open vN" fetches an audited, short-lived signed URL. In live mode the
   fixture turnaround and approval-rate figures are NOT shown — no endpoint
   answers them yet, and invented stats must not sit beside real work (§22).

   SERVER-PAGED (2026-09-29). The live desk never fetches the whole
   pipeline: this page reads ?tab ?q ?camp ?kind ?sort ?page ?size, asks
   GET /deliverables for exactly that page (search, filters, sort and paging
   in the database) and GET /deliverables/summary for the hero's figures,
   the pipeline strip, the tab counts and the campaign filter. The fixture
   desk (demo, and staff outside the desk's roles) stays the in-memory
   ApprovalsDesk.

   TWO KINDS OF SUBJECT (P9-BE-16). Beside the deliverables, the live desk
   lists SponsorX NEXT edition ad artwork — GET /edition-artwork, rows with
   `subject: EDITION_ARTWORK`, the edition and the slot. Same states, same
   BTG steps (start review, send to the sponsor, ask for changes); no
   Approve, because the sign-off is the buying sponsor's, on their campaign
   page. A handful per edition, so the list is read whole, waiting first.
   -------------------------------------------------------------------------- */

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"];

/** One page of the desk plus its summary — or null when this isn't a live desk. */
async function liveDesk(sp: SearchParams) {
  /* No catch — an outage is an error page, never fixtures dressed as the
     real queue (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;

  const [sumRes, artRes] = await Promise.all([
    apiFetch(`/deliverables/summary${DESK_SUMMARY_QUERY}`),
    apiFetch("/edition-artwork"),
  ]);
  if (!sumRes.ok) throw new Error(`Content queue unavailable (${sumRes.status}).`);
  if (!artRes.ok) throw new Error(`Edition artwork unavailable (${artRes.status}).`);
  const summary = (await sumRes.json()) as DeskSummary;
  /* Waiting first (oldest submission first, as the API orders them), then approved. */
  const artwork = ((await artRes.json()) as { artwork: ApiArtwork[] }).artwork
    .slice()
    .sort((a, b) => Number(a.state === "APPROVED") - Number(b.state === "APPROVED"));

  const filters = deskFilters(sp);
  /* A stale or hand-typed campaign id is dropped, not sent. */
  if (filters.camp && !summary.campaigns.some((c) => c.id === filters.camp)) filters.camp = "";
  if (summary.total === 0) return { summary, filters, rows: [], page: null, artwork };

  const res = await apiFetch(`/deliverables${deskListQuery(filters, pageParams(sp))}`);
  if (!res.ok) throw new Error(`Content queue unavailable (${res.status}).`);
  const body = (await res.json()) as { deliverables: ApiDeliverable[]; page: PageInfo };
  const now = new Date();
  return { summary, filters, rows: body.deliverables.map((d) => toDeskItem(d, now)), page: body.page, artwork };
}

const PIPELINE_HINTS = [
  "A draft lands from the athlete portal",
  "Brand safety and brief fit",
  "The sponsor's final say",
  "Approved, publishing on schedule",
];

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess("/admin/approvals");
    if (lacking) return <NotInRole path="/admin/approvals" title="Content approvals" roles={lacking} />;
  }

  const sp = await searchParams;
  const live = demo === null ? await liveDesk(sp) : null;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Content approvals
      </h1>
      <p className="mt-1 text-xs text-muted">
        Review submitted content, pass it to the sponsor, and clear it to
        publish.
      </p>
    </div>
  );

  if (demo === "empty" || (live && live.summary.total === 0 && live.artwork.length === 0)) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="Nothing waiting on review"
          hint="Deliverables arrive here when athletes submit content."
        />
      </div>
    );
  }

  /* The hero's figures: the live desk's from the summary (counted in the
     database, a sent-back revision is with the athlete, not on a desk); the
     fixture desk's from its in-memory queue. */
  const fixtureItems = [...contentReviewQueue, ...contentCleared];
  const { waiting, aging, stageCounts } = live
    ? deskHeadline(live.summary)
    : {
        waiting: contentReviewQueue.length,
        aging: contentReviewQueue.filter((d) => d.waitingHours > AGING_HOURS).length,
        stageCounts: [
          contentReviewQueue.filter((d) => d.state === "DRAFT_SUBMITTED").length,
          contentReviewQueue.filter((d) => d.state === "BTG_REVIEW").length,
          contentReviewQueue.filter((d) => d.state === "SPONSOR_REVIEW").length,
          contentCleared.length,
        ],
      };

  // The fixture desk seeds its tabs and filters from the URL so a filtered
  // queue is shareable; it clamps stale values and keeps the URL in sync.
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* P7-QA-02: this fixture branch also reaches signed-in staff outside
          the desk's roles (NETWORK_MGR, SALES, FINANCE) — its POSTGRES-chipped
          turnaround / approval rate are sample data. */}
      {demo === null && !live && (
        <BlockedNotice>
          Demo data — the live approvals queue is read by BTG admin and the
          Campaign Manager, so every figure below is sample data.
        </BlockedNotice>
      )}

      {/* ------------------------------------------------------- hero band */}
      <HeroBand border="border-admin/25" className="sx-animate">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Approval queue
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {waiting}
              </span>
              <span className="text-sm text-muted">
                {waiting === 1 ? "deliverable" : "deliverables"} awaiting a
                decision
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>

            <div className="mt-4 space-y-2.5 text-xs text-muted">
              {aging > 0 ? (
                <p className="flex items-center gap-2">
                  <span
                    className="relative inline-flex size-2 shrink-0"
                    aria-hidden="true"
                  >
                    <span className="sx-viz-pulse absolute inset-0 rounded-full bg-warn" />
                    <span className="relative inline-flex size-2 rounded-full bg-warn" />
                  </span>
                  <span>
                    <strong className="font-semibold text-text">{aging}</strong>{" "}
                    waiting over {AGING_HOURS} hours — the queue below puts them
                    first
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2">
                  <span
                    className="inline-flex size-2 shrink-0 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  <span>
                    Queue is fresh — nothing waiting over {AGING_HOURS} hours
                  </span>
                </p>
              )}
              {!live && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  Median turnaround
                  <strong className="font-semibold text-text">
                    {adminApprovalsX.medianTurnaroundHours}h
                  </strong>
                  · approval rate
                  <strong className="font-semibold text-text">
                    {adminApprovalsX.approvalRatePct}%
                  </strong>
                  <MiniChip kind="ver">POSTGRES</MiniChip>
                </p>
              )}
            </div>
          </div>

          {/* The §21 pipeline as four desks — the teaching element; the
              drawer's stage tracker repeats the same labels. */}
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              How content clears
            </p>
            <ol className="mt-2 space-y-1.5">
              {PIPELINE_STEPS.map((label, i) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface/75 px-3 py-2"
                >
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-admin/15 text-[10px] font-semibold text-admin"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-tight">
                      {label}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-faint">
                      {PIPELINE_HINTS[i]}
                    </span>
                  </span>
                  <span className="tabular-nums text-sm font-semibold">
                    {stageCounts[i]}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </HeroBand>

      {/* ----------------------------------------------------------- desk */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title="The queue"
          hint="Click a deliverable to review it — search and filters apply instantly."
        />
        {live && !live.page ? (
          <EmptyState
            mark="inbox"
            title="No deliverables waiting"
            hint="Deliverables arrive here when athletes submit content."
          />
        ) : live && live.page ? (
          <ApprovalsDeskServer
            rows={live.rows}
            page={live.page}
            counts={deskHeadline(live.summary).tabs}
            campaigns={live.summary.campaigns}
            filters={live.filters}
            live={{ act: approvalAction, link: assetLink }}
          />
        ) : (
          <ApprovalsDesk
            items={fixtureItems}
            demoParam={one(sp.demo) || undefined}
            initial={{
              tab: one(sp.tab),
              q: one(sp.q),
              camp: one(sp.camp),
              kind: one(sp.kind),
              sort: one(sp.sort),
              page: one(sp.page),
              size: one(sp.size),
            }}
          />
        )}
      </section>

      {/* --------------------------------------------- edition ad artwork */}
      {live && live.artwork.length > 0 && (
        <section className="sx-animate sx-delay-2">
          <SectionHeading
            title="Edition ad artwork"
            hint={`${live.artwork.filter((a) => a.state !== "APPROVED").length} waiting · ${live.artwork.filter((a) => a.btgReviewSkipped).length} skipped BTG review · SponsorX NEXT ads — checked on upload, BTG reviews, the sponsor signs off`}
          />
          <ArtworkQueue rows={live.artwork} now={requestTime()} act={artworkAction} link={artworkLink} />
        </section>
      )}

      {/* ------------------------------------------------------ trust note */}
      <p className="sx-animate sx-delay-2 text-[10px] leading-relaxed text-faint">
        Creative assets live in a private bucket and are only ever opened
        through short-lived signed links. Usage-rights windows are tracked from
        publication — a published post whose window closes is flagged for
        takedown (wired in B5 with the upload pipeline).
      </p>
    </div>
  );
}
