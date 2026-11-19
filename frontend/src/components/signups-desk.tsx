"use client";

/* --------------------------------------------------------------------------
   SignupsDesk — /admin/new-signups' list (POL-FE-109, 2026-11-17). The desk
   redrawn like the athlete's Inventory and Listings, the same way
   /admin/applications was the same morning (POL-FE-106), on the Mission
   Control stage. The owner: "do what we did in listing and inventory …
   easy to understand … add loaders and how it works".

   The page's one client island (the status cards and header are server
   components in signup-stage.tsx). SERVER-PAGED, like before: every control
   writes the URL through <ServerList> and the server page re-reads it;
   nothing filters in the browser.

   - Toolbar   two tabs (All sign-ups / Needs review — the dot says something
               is held), List ↔ Cards (List first, remembered per browser),
               search, and the kind as a dropdown. No counts on the controls:
               the status cards above carry every number.
   - List      one sign-up per row: who (a kind mark, name, one line) · kind
               · signed up · status pill and why · Review / Open. A held or
               flagged row has an orange edge and an orange "Review" button.
               The whole row is the link.
   - Loaders   any tab, kind, search, size or page change is a server round
               trip: a spinner on the tab, a running bar, "Loading
               sign-ups…" and a skeleton of the list, held half a second so
               a fast answer doesn't flicker.
   - How it works  a header button: the five steps on a rail, then a key to
               reading the list (desk-kit's panel).

   Words and URL patches: lib/new-signups-live.ts. Styles: `.sx-ap-*` from
   admin/applications/(queue)/applications.css and `.sx-su-*` from
   admin/new-signups/(stream)/signups.css.
   -------------------------------------------------------------------------- */

import Link from "next/link";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import {
  HowItWorks,
  ListLoading,
  PagerGhost,
  SegTabs,
  StatusPill,
  ViewToggle,
  rise,
  useDeskView,
  useLoaderShown,
  type DeskLayout,
  type FlowStep,
  type SegTab,
} from "@/components/desk-kit";
import { Dropdown, FilterChip } from "@/components/filter-kit";
import { ProblemTags } from "@/components/problem-tags";
import { ListSearch, PagerRow, useListNav } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import { streamEmpty, streamPatch, type StreamFilter, type StreamKind, type StreamRowView } from "@/lib/new-signups-live";

const VIEW_KEY = "sx-su-view";

/** Each kind's mark. The word always sits beside it; the hue is never the only cue. */
const KIND_ICON: Record<StreamKind, UiGlyph> = {
  ORGANIZATION: "school",
  ATHLETE: "trophy",
  GUARDIAN: "shield",
  SPONSOR: "megaphone",
};

type TabKey = "all" | "review";

/* -------------------------------------------------------------------- desk */

export function SignupsDesk({
  rows,
  page,
  filter,
  kinds,
  held,
  forceLoading = false,
}: {
  /** This page of the stream, in the desk's words. */
  rows: StreamRowView[];
  /** Null when there is no page to pace through (nothing read). */
  page: PageInfo | null;
  filter: StreamFilter;
  /** The kinds this role reads, for the dropdown. */
  kinds: { value: string; label: string }[];
  /** How many are held in all — lights the dot on "Needs review". */
  held: number;
  /** `?demo=loading`: hold the loading face. */
  forceLoading?: boolean;
}) {
  const nav = useListNav();
  const layout = useDeskView(VIEW_KEY);
  const fetching = useLoaderShown(nav.pending);
  const loading = fetching || forceLoading;

  const tabs: SegTab<TabKey>[] = [
    { key: "all", label: "All sign-ups" },
    { key: "review", label: "Needs review", dot: held > 0 },
  ];
  const kindLabel = kinds.find((k) => k.value === filter.kind)?.label ?? "";
  const narrowed = Boolean(filter.q || filter.kind);
  const empty = streamEmpty(filter);
  const reset = () => nav.set({ ...streamPatch(filter, { kind: "" }), q: null });

  return (
    <div className="sx-ap sx-su">
      {/* One grid, two layouts (applications.css `.sx-ap-bar`). Wide: the tabs
          and List ↔ Cards on top, search and the kind under. Phone: tabs full
          width; search with an icon-only List ↔ Cards; the kind on its row. */}
      <div className="sx-ap-bar sx-ap-rise" style={rise(0.34)}>
        <div className="sx-ap-bar-tabs">
          <SegTabs
            tabs={tabs}
            tab={filter.review ? "review" : "all"}
            onPick={(k) => nav.set(streamPatch(filter, { review: k === "review" }))}
            busy={fetching}
            label="Show sign-ups"
          />
        </div>
        <div className="sx-ap-bar-views">
          <ViewToggle view={layout} storageKey={VIEW_KEY} />
        </div>
        <div className="sx-ap-bar-search">
          <ListSearch initial={filter.q} label="Search sign-ups" placeholder="Search name, team, email…" tone="admin" />
        </div>
        <div className="sx-ap-bar-filters">
          <div className="sx-ap-f">
            <Dropdown
              label="Filter by kind"
              allLabel="All kinds"
              value={filter.kind}
              options={kinds}
              onChange={(v) => nav.set(streamPatch(filter, { kind: v }))}
              tone="admin"
            />
          </div>
        </div>
      </div>

      {/* What's applied, each removable. */}
      {narrowed && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {filter.q && (
            <FilterChip tone="admin" label="Remove search" onClear={() => nav.set({ q: null })}>
              &ldquo;{filter.q}&rdquo;
            </FilterChip>
          )}
          {filter.kind && (
            <FilterChip tone="admin" label="Remove kind filter" onClear={() => nav.set(streamPatch(filter, { kind: "" }))}>
              {kindLabel}
            </FilterChip>
          )}
          <button type="button" onClick={reset} className="text-[11px] font-medium text-muted transition-colors hover:text-danger">
            Clear all
          </button>
        </div>
      )}

      {(loading || (page && rows.length > 0)) && (
        <div className="mb-3 sx-ap-rise" style={rise(0.4)}>
          {loading || !page ? (
            <PagerGhost />
          ) : (
            <PagerRow page={page} noun="Sign-ups" tone="admin" position="top" filtered={narrowed || filter.review} />
          )}
        </div>
      )}

      {loading ? (
        <ListLoading label="Loading sign-ups…">
          <SignupSkeleton layout={layout} />
        </ListLoading>
      ) : rows.length === 0 ? (
        <div className="sx-ap-none sx-ap-rise" style={rise(0.42)}>
          <span className="sx-ap-none-mark" aria-hidden="true">
            <Glyph ui={filter.q || filter.kind ? "eye" : "check"} className="size-7" />
          </span>
          <p className="text-sm font-semibold text-white">{empty.title}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#9aa4b2]">{empty.hint}</p>
          {narrowed && (
            <button type="button" onClick={reset} className="mt-3 text-xs font-medium text-[#63b4f8] transition-colors hover:text-[#9be0ff]">
              Clear the search and kind
            </button>
          )}
        </div>
      ) : layout === "list" ? (
        <div key="list" className="sx-ap-list sx-su-list" role="region" aria-label="Sign-ups, newest first">
          <div className="sx-ap-head sx-su-cols" aria-hidden="true">
            <span>Who</span>
            <span>Kind</span>
            <span>Signed up</span>
            <span>Status · why</span>
            <span />
          </div>
          <ul>
            {rows.map((r, i) => (
              <SignupRow key={r.key} r={r} i={i} />
            ))}
          </ul>
        </div>
      ) : (
        <ul key="cards" aria-label="Sign-ups, newest first" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r, i) => (
            <SignupCard key={r.key} r={r} i={i} />
          ))}
        </ul>
      )}

      {page && rows.length > 0 && !loading && (
        <div className="mt-3">
          <PagerRow page={page} noun="Sign-ups" tone="admin" position="bottom" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function KindMark({ kind }: { kind: StreamKind }) {
  return (
    <span className="sx-su-avatar" data-kind={kind} aria-hidden="true">
      <Glyph ui={KIND_ICON[kind]} className="size-[18px]" />
    </span>
  );
}

function KindChip({ r }: { r: StreamRowView }) {
  return (
    <span className="sx-su-kind" data-kind={r.kind}>
      <span className="sx-su-kind-dot" aria-hidden="true" />
      {r.kindWord}
    </span>
  );
}

/** Why it stands where it does: a held row's problems as tags (the reason on
 *  hover, POL-FE-42), otherwise the one line. */
function Why({ r }: { r: StreamRowView }) {
  return <span className="sx-su-why">{r.problems.length ? <ProblemTags problems={r.problems} compact /> : r.reason}</span>;
}

/** The row's (or card's) one link: it covers the whole row, so a click
 *  anywhere opens the sign-up, and its name says which one. */
function Go({ r }: { r: StreamRowView }) {
  const verb = r.held ? "Review" : "Open";
  return (
    <Link href={r.href} aria-label={`${verb} ${r.name}`} className="sx-su-go" data-held={r.held ? "" : undefined}>
      <span className="sx-su-go-btn">
        <span className="sx-su-go-word">{verb}</span>
        <Glyph ui="arrow" className="size-4" />
      </span>
    </Link>
  );
}

function SignupRow({ r, i }: { r: StreamRowView; i: number }) {
  return (
    <li className="sx-ap-rise" style={rise(0.44 + Math.min(i, 14) * 0.035)}>
      <div data-spot="" data-held={r.held ? "" : undefined} className="sx-ap-row sx-su-row sx-su-cols">
        <span className="sx-ap-who">
          <KindMark kind={r.kind} />
          <span className="min-w-0">
            <span className="sx-ap-name">{r.name}</span>
            <span className="sx-ap-sub">{r.sub || r.kindWord}</span>
          </span>
        </span>
        <span className="sx-su-kindcell">
          <KindChip r={r} />
        </span>
        <span className="sx-ap-wait sx-su-when">
          <span className="sx-ap-wait-num">{r.when}</span>
          <span className="sx-ap-wait-cap">signed up</span>
        </span>
        <span className="sx-ap-state sx-su-state">
          <StatusPill tone={r.pill.tone} act={r.pill.act}>{r.pill.label}</StatusPill>
          <Why r={r} />
        </span>
        <Go r={r} />
      </div>
    </li>
  );
}

function SignupCard({ r, i }: { r: StreamRowView; i: number }) {
  return (
    <li className="sx-ap-rise" style={rise(0.44 + Math.min(i, 11) * 0.05)}>
      <div
        data-spot=""
        data-held={r.held ? "" : undefined}
        style={{ "--tone": r.held ? "#fb923c" : "#63b4f8" } as React.CSSProperties}
        className="sx-ops-card sx-su-card"
      >
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
        <span className="sx-ap-who">
          <KindMark kind={r.kind} />
          <span className="min-w-0">
            <span className="sx-ap-name">{r.name}</span>
            <span className="sx-ap-sub">{r.sub || r.kindWord}</span>
          </span>
        </span>
        <span className="sx-su-card-meta">
          <KindChip r={r} />
          <span>Signed up {r.when}</span>
        </span>
        <span className="sx-su-state">
          <StatusPill tone={r.pill.tone} act={r.pill.act}>{r.pill.label}</StatusPill>
          <Why r={r} />
        </span>
        <span className="sx-su-card-foot">
          <Go r={r} />
        </span>
      </div>
    </li>
  );
}

/** The list's skeleton, in its own shape: for the route's loading screen and
 *  for every re-fetch. */
export function SignupSkeleton({ layout = "list", n = 6 }: { layout?: DeskLayout; n?: number }) {
  if (layout === "cards") {
    return (
      <div aria-hidden="true" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="sx-ops-panel sx-ops-ghost relative min-h-[12.5rem]" />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="sx-ap-list sx-su-list">
      <div className="sx-ap-head sx-su-cols">
        <span>Who</span>
        <span>Kind</span>
        <span>Signed up</span>
        <span>Status · why</span>
        <span />
      </div>
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <li key={i}>
            <div className="sx-ap-row sx-ap-row-ghost sx-su-row sx-su-cols">
              <span className="sx-ap-who">
                <span className="sx-su-avatar sx-ops-ghost" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="sx-ops-ghost block h-3.5 w-40 max-w-full rounded" />
                  <span className="sx-ops-ghost block h-2.5 w-28 max-w-full rounded" />
                </span>
              </span>
              <span className="sx-su-kindcell">
                <span className="sx-ops-ghost block h-5 w-24 rounded-full" />
              </span>
              <span className="sx-ap-wait sx-su-when">
                <span className="sx-ops-ghost block h-3 w-12 rounded" />
                <span className="sx-ops-ghost block h-2.5 w-14 rounded" />
              </span>
              <span className="sx-ap-state sx-su-state">
                <span className="sx-ops-ghost block h-5 w-36 max-w-full rounded-full" />
                <span className="sx-ops-ghost block h-2.5 w-44 max-w-full rounded" />
              </span>
              <span className="sx-su-go-ghost sx-ops-ghost" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ how it works */

const STEPS: FlowStep[] = [
  { icon: "users", title: "Someone signs up", text: "An organization, athlete, guardian or sponsor joins from the public pages." },
  { icon: "shield", title: "SponsorX checks it", text: "The same checks every time, the moment they join. You don’t start anything." },
  { icon: "bolt", title: "Most are approved automatically", text: "They get in straight away and are emailed. There is nothing for you to do." },
  { icon: "hourglass", title: "A few are held for you", text: "When a check finds something, the sign-up waits under “Needs review” and says why." },
  { icon: "check", title: "You decide", text: "Open it, then approve or reject. A rejection needs a reason, emailed as you wrote it. A rejected sign-up can be reinstated later." },
];

/** "How it works" for this desk (the panel itself is desk-kit's). */
export function SignupsHowItWorks() {
  return (
    <HowItWorks lede="From someone joining SponsorX to an approved account, and where you come in." steps={STEPS}>
      <li>
        <span className="sx-ap-key-mark">
          <StatusPill tone="amber" act>Needs review</StatusPill>
        </span>
        <span>A pulsing dot means it&rsquo;s waiting on you.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <span className="sx-ap-key-late" aria-hidden="true" />
        </span>
        <span>An orange edge marks every sign-up that is held or flagged. Its button says &ldquo;Review&rdquo;.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <StatusPill tone="green" act={false}>Approved</StatusPill>
        </span>
        <span>Green passed its checks, or you approved it. &ldquo;Open&rdquo; just shows the account.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <span className="sx-su-key-edit" aria-hidden="true">
            <Glyph ui="edit" className="size-4" />
          </span>
        </span>
        <span>
          Sensitive profile edits, under the list: a legal name, date of birth or guardian change on an approved athlete.
        </span>
      </li>
    </HowItWorks>
  );
}
