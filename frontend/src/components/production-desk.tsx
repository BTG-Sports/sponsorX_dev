"use client";

/* --------------------------------------------------------------------------
   ProductionDesk — /admin/next/production's list (P9-FE-16), on the Mission
   Control stage, drawn like the other redrawn desks (desk-kit: the
   applications desk POL-FE-106, new sign-ups POL-FE-109).

   The page's one client island; the header and number cards are server
   components (production-stage.tsx). Every control writes the URL through
   <ServerList> and the server page re-reads it — the edition, the tab, the
   kind and the search — so a link to the board is a link to that view.

   - Toolbar   three tabs (Still needs something / Ready / All pieces — the
               dot says BTG has a move), List ↔ Cards, search, and two
               dropdowns: the edition and the kind of piece. No counts on the
               controls: the cards above carry every number.
   - List      one piece per row: what it is (a mark, its title, kind and
               who) · the kind of piece · a pill saying whose move it is,
               then each thing it still needs in the API's words, and a note
               where there is one · one button to where it is fixed. BTG's
               moves have an orange edge and an orange button and come first.
               The whole row is the link.
   - Loaders   any change is a server round trip: a spinner on the tab, a
               running bar, "Loading the board…" and a skeleton of the list.
   - How it works   a header button: the steps on a rail, then a key.

   Words, links and URL patches: lib/production-live.ts. Styles: `.sx-ap-*`
   (applications.css), `.sx-su-*` (signups.css) and `.sx-pb-*`
   (admin/next/production/production.css).
   -------------------------------------------------------------------------- */

import Link from "next/link";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import {
  HowItWorks, ListLoading, SegTabs, StatusPill, ViewToggle, rise, useDeskView, useLoaderShown,
  type DeskLayout, type FlowStep, type SegTab,
} from "@/components/desk-kit";
import { Dropdown, FilterChip } from "@/components/filter-kit";
import { ListSearch, useListNav } from "@/components/server-pager";
import {
  BOARD_TABS, SOURCE_OPTIONS, boardEmpty, boardPatch, type BoardFilter, type BoardRowView, type BoardShow, type BoardSource,
} from "@/lib/production-live";

const VIEW_KEY = "sx-pb-view";

/** Each kind of piece's mark. The word always sits beside it; the hue is never the only cue. */
const SOURCE_ICON: Record<BoardSource, UiGlyph> = {
  ASSIGNMENT: "edit",
  CONTENT: "stack",
  ARTWORK: "megaphone",
  COVER: "box",
  PRESS_PDF: "rows",
};

export function ProductionDesk({
  rows,
  total,
  filter,
  editions,
  editionId,
  mine,
  forceLoading = false,
}: {
  /** The pieces the filter leaves, in the desk's words, BTG's moves first. */
  rows: BoardRowView[];
  /** Every piece on the edition, before the filter — for the empty state's words. */
  total: number;
  filter: BoardFilter;
  /** The editions this role reads, for the dropdown. */
  editions: { value: string; label: string }[];
  editionId: string;
  /** How many pieces are BTG's move — lights the dot on "Still needs something". */
  mine: number;
  /** `?demo=loading`: hold the loading face. */
  forceLoading?: boolean;
}) {
  const nav = useListNav();
  const layout = useDeskView(VIEW_KEY);
  const fetching = useLoaderShown(nav.pending);
  const loading = fetching || forceLoading;

  const tabs: SegTab<BoardShow>[] = BOARD_TABS.map((t) => ({ ...t, dot: t.key === "waiting" && mine > 0 }));
  const sourceLabel = SOURCE_OPTIONS.find((s) => s.value === filter.source)?.label ?? "";
  const narrowed = Boolean(filter.q || filter.source);
  const empty = boardEmpty(filter, total);
  const reset = () => nav.set({ ...boardPatch(filter, { source: "" }), q: null });

  return (
    <div className="sx-ap sx-su sx-pb">
      <div className="sx-ap-bar sx-ap-rise" style={rise(0.34)}>
        <div className="sx-ap-bar-tabs">
          <SegTabs tabs={tabs} tab={filter.show} onPick={(k) => nav.set(boardPatch(filter, { show: k }))} busy={fetching} label="Show pieces" />
        </div>
        <div className="sx-ap-bar-views">
          <ViewToggle view={layout} storageKey={VIEW_KEY} />
        </div>
        <div className="sx-ap-bar-search">
          <ListSearch initial={filter.q} label="Search pieces" placeholder="Search a title, student or sponsor…" tone="admin" />
        </div>
        <div className="sx-ap-bar-filters">
          {editions.length > 1 && (
            <div className="sx-ap-f">
              <Dropdown
                label="Edition"
                allLabel="Edition"
                includeAll={false}
                value={editionId}
                options={editions}
                onChange={(v) => nav.set({ edition: v })}
                tone="admin"
              />
            </div>
          )}
          <div className="sx-ap-f">
            <Dropdown
              label="Filter by kind of piece"
              allLabel="All kinds"
              value={filter.source}
              options={SOURCE_OPTIONS}
              onChange={(v) => nav.set(boardPatch(filter, { source: v }))}
              tone="admin"
            />
          </div>
        </div>
      </div>

      {narrowed && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {filter.q && (
            <FilterChip tone="admin" label="Remove search" onClear={() => nav.set({ q: null })}>
              &ldquo;{filter.q}&rdquo;
            </FilterChip>
          )}
          {filter.source && (
            <FilterChip tone="admin" label="Remove kind filter" onClear={() => nav.set(boardPatch(filter, { source: "" }))}>
              {sourceLabel}
            </FilterChip>
          )}
          <button type="button" onClick={reset} className="text-[11px] font-medium text-muted transition-colors hover:text-danger">
            Clear all
          </button>
        </div>
      )}

      {loading ? (
        <ListLoading label="Loading the board…">
          <ProductionSkeleton layout={layout} />
        </ListLoading>
      ) : rows.length === 0 ? (
        <div className="sx-ap-none sx-ap-rise" style={rise(0.42)}>
          <span className="sx-ap-none-mark" aria-hidden="true">
            <Glyph ui={empty.good ? "check" : "eye"} className="size-7" />
          </span>
          <p className="text-sm font-semibold text-white">{empty.title}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#9aa4b2]">{empty.hint}</p>
          {narrowed ? (
            <button type="button" onClick={reset} className="mt-3 text-xs font-medium text-[#63b4f8] transition-colors hover:text-[#9be0ff]">
              Clear the search and kind
            </button>
          ) : (
            filter.show !== "all" && total > 0 && (
              <button
                type="button"
                onClick={() => nav.set(boardPatch(filter, { show: "all" }))}
                className="mt-3 text-xs font-medium text-[#63b4f8] transition-colors hover:text-[#9be0ff]"
              >
                Show all pieces
              </button>
            )
          )}
        </div>
      ) : layout === "list" ? (
        <div key="list" className="sx-ap-list sx-su-list" role="region" aria-label="The edition's pieces, yours first">
          <div className="sx-ap-head sx-pb-cols" aria-hidden="true">
            <span>Piece</span>
            <span>Kind</span>
            <span>What it still needs</span>
            <span />
          </div>
          <ul>
            {rows.map((r, i) => (
              <PieceRow key={r.key} r={r} i={i} />
            ))}
          </ul>
          <p className="sx-pb-count" aria-live="polite">
            {rows.length} piece{rows.length === 1 ? "" : "s"} shown{rows.length === total ? "" : ` of ${total}`}
          </p>
        </div>
      ) : (
        <>
          <ul key="cards" aria-label="The edition's pieces, yours first" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((r, i) => (
              <PieceCard key={r.key} r={r} i={i} />
            ))}
          </ul>
          <p className="sx-pb-count" aria-live="polite">
            {rows.length} piece{rows.length === 1 ? "" : "s"} shown{rows.length === total ? "" : ` of ${total}`}
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function SourceMark({ source }: { source: BoardSource }) {
  return (
    <span className="sx-su-avatar" data-kind={source} aria-hidden="true">
      <Glyph ui={SOURCE_ICON[source] ?? "stack"} className="size-[18px]" />
    </span>
  );
}

function SourceChip({ r }: { r: BoardRowView }) {
  return (
    <span className="sx-su-kind" data-kind={r.source}>
      <span className="sx-su-kind-dot" aria-hidden="true" />
      {r.sourceWord}
    </span>
  );
}

/** Whose move it is, then each thing the piece still needs, as the API words it. */
function Needs({ r }: { r: BoardRowView }) {
  return (
    <>
      <StatusPill tone={r.pill.tone} act={r.pill.act}>{r.pill.label}</StatusPill>
      {r.needs.length > 0 && (
        <ul className="sx-pb-needs" aria-label={`${r.title} still needs`}>
          {r.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {r.note && <span className="sx-pb-note">{r.note}</span>}
    </>
  );
}

/** The row's (or card's) one link: it covers the whole row, and its name says where it goes. */
function Go({ r }: { r: BoardRowView }) {
  return (
    <Link href={r.href} aria-label={`${r.verb}: ${r.title}`} className="sx-su-go" data-held={r.mine ? "" : undefined}>
      <span className="sx-su-go-btn">
        <span className="sx-su-go-word">{r.verb}</span>
        <Glyph ui="arrow" className="size-4" />
      </span>
    </Link>
  );
}

function PieceRow({ r, i }: { r: BoardRowView; i: number }) {
  return (
    <li className="sx-ap-rise" style={rise(0.44 + Math.min(i, 14) * 0.035)}>
      <div data-spot="" data-held={r.mine ? "" : undefined} className="sx-ap-row sx-su-row sx-pb-row sx-pb-cols">
        <span className="sx-ap-who">
          <SourceMark source={r.source} />
          <span className="min-w-0">
            <span className="sx-ap-name">{r.title}</span>
            <span className="sx-ap-sub">{r.sub || r.sourceWord}</span>
          </span>
        </span>
        <span className="sx-su-kindcell">
          <SourceChip r={r} />
        </span>
        <span className="sx-ap-state sx-su-state">
          <Needs r={r} />
        </span>
        <Go r={r} />
      </div>
    </li>
  );
}

function PieceCard({ r, i }: { r: BoardRowView; i: number }) {
  return (
    <li className="sx-ap-rise" style={rise(0.44 + Math.min(i, 11) * 0.05)}>
      <div
        data-spot=""
        data-held={r.mine ? "" : undefined}
        style={{ "--tone": r.mine ? "#fb923c" : r.ready ? "#4ade80" : "#63b4f8" } as React.CSSProperties}
        className="sx-ops-card sx-su-card"
      >
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
        <span className="sx-ap-who">
          <SourceMark source={r.source} />
          <span className="min-w-0">
            <span className="sx-ap-name">{r.title}</span>
            <span className="sx-ap-sub">{r.sub || r.sourceWord}</span>
          </span>
        </span>
        <span className="sx-su-card-meta">
          <SourceChip r={r} />
        </span>
        <span className="sx-su-state">
          <Needs r={r} />
        </span>
        <span className="sx-su-card-foot">
          <Go r={r} />
        </span>
      </div>
    </li>
  );
}

/** The list's skeleton, in its own shape: for the route's loading screen and for every re-fetch. */
export function ProductionSkeleton({ layout = "list", n = 6 }: { layout?: DeskLayout; n?: number }) {
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
      <div className="sx-ap-head sx-pb-cols">
        <span>Piece</span>
        <span>Kind</span>
        <span>What it still needs</span>
        <span />
      </div>
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <li key={i}>
            <div className="sx-ap-row sx-ap-row-ghost sx-su-row sx-pb-row sx-pb-cols">
              <span className="sx-ap-who">
                <span className="sx-su-avatar sx-ops-ghost" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="sx-ops-ghost block h-3.5 w-44 max-w-full rounded" />
                  <span className="sx-ops-ghost block h-2.5 w-28 max-w-full rounded" />
                </span>
              </span>
              <span className="sx-su-kindcell">
                <span className="sx-ops-ghost block h-5 w-24 rounded-full" />
              </span>
              <span className="sx-ap-state sx-su-state">
                <span className="sx-ops-ghost block h-5 w-32 max-w-full rounded-full" />
                <span className="sx-ops-ghost block h-2.5 w-48 max-w-full rounded" />
                <span className="sx-ops-ghost block h-2.5 w-36 max-w-full rounded" />
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
  { icon: "edit", title: "Students write and shoot", text: "The advisor assigns a piece, the student submits a draft, and the advisor approves it or asks for changes." },
  { icon: "stack", title: "Content joins the edition", text: "An approved piece, or one BTG adds, needs its file and a right to publish it: digital always, print only once a print date is set." },
  { icon: "megaphone", title: "Sponsors send their ads", text: "Each sold slot needs the sponsor’s artwork, BTG’s review and the sponsor’s sign-off." },
  { icon: "box", title: "The cover and the press PDF", text: "The edition needs a cover. The press PDF is only needed if the edition is printed." },
  { icon: "check", title: "Everything ready, it can publish", text: "This board asks the same questions as the publishing gate, so when a piece is ready here, the gate agrees." },
];

/** "How it works" for this desk (the panel itself is desk-kit's). */
export function ProductionHowItWorks() {
  return (
    <HowItWorks lede="Every piece of one edition, and what each still needs before it publishes." steps={STEPS}>
      <li>
        <span className="sx-ap-key-mark">
          <StatusPill tone="amber" act>Needs you</StatusPill>
        </span>
        <span>A pulsing dot and an orange edge: the next step is BTG&rsquo;s. Its button takes you where it&rsquo;s done.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <StatusPill tone="cyan" act={false}>Waiting on the sponsor</StatusPill>
        </span>
        <span>Blue: someone else has the next step — a student, the advisor or a sponsor. Nothing for you to do yet.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <StatusPill tone="green" act={false}>Ready</StatusPill>
        </span>
        <span>Green needs nothing more.</span>
      </li>
      <li>
        <span className="sx-ap-key-mark">
          <span className="sx-ap-key-late" aria-hidden="true" />
        </span>
        <span>Under each pill is what the piece still needs, word for word as the publishing gate asks it.</span>
      </li>
    </HowItWorks>
  );
}
