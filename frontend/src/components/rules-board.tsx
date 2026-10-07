"use client";

/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority board (P1-ART-17, the Control Panel).
   One client island so anything picked can fill the form.

   BUILT FOR SCALE (owner, 2026-10-05: "what if there are more countries and
   more states / provinces"). The page never lays out the whole table:

   - the dialog  "+ Add a place" and every card open one modal
                 (place-dialog.tsx): adding picks a real country and state
                 from dropdowns (no free text — owner, 2026-10-05), changing
                 moves only the age, Remove confirms. A change that goes
                 through closes it and is said on the board.
   - search      one box across every country, by code or by name (lib
                 searchPlaces): picking a result selects its country and
                 loads the place into the form. A listbox with ↑ ↓ ⏎ Esc.
   - the rail    every country once (biggest first), its default age, places
                 and exceptions; its own filter and an All / Not 18 switch.
                 It scrolls inside its panel, so 20 countries or 200 the page
                 is the same height.
   - the detail  the selected country: its default (the whole-country row),
                 then every place as a large card (code and name, age, its
                 status against the default, who set it when), exceptions
                 first, 20 to a page with the house pager above and below,
                 and All / Exceptions / Follow the default tabs (owner,
                 2026-10-05: "list the items 20 items per page, make the
                 items large, add more detail on each items").

   Picking a place opens the dialog on it — the change happens where the
   eye already is (the earlier inline form scrolled; owner, 2026-10-05:
   "this is better if this is a popup"). The picked card stays lit.
   -------------------------------------------------------------------------- */

import { useMemo, useRef, useState, type CSSProperties } from "react";

import { SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import { PlaceDialog, type DialogMode } from "@/components/place-dialog";
import {
  ageBand, changedWords, countryDetail, countryIndex, placeLabel, placeList, placePage, regionName, searchPlaces, statusWords,
  type AgeBand, type AgeRow, type CountryDetail, type CountryEntry, type PlaceFilter, type SearchHit,
} from "@/lib/age-table";

const CHAMFER = "[clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]";
const BAND: Record<AgeBand, { tile: string; age: string }> = {
  young: { tile: "border-[#a479ff]/45 bg-[#a479ff]/10", age: "text-[#c3a6ff]" },
  eighteen: { tile: "border-[#63b4f8]/22 bg-[#0a121e]/60", age: "text-[#93c5fd]" },
  nineteen: { tile: "border-[#9be0ff]/55 bg-[#9be0ff]/[0.08]", age: "text-[#9be0ff]" },
  older: { tile: "border-[#fb923c]/60 bg-[#f97a1f]/[0.12]", age: "text-[#fdba74]" },
};
const at = (s: number) => ({ "--sx-reveal-delay": `${s}s` }) as CSSProperties;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function RulesBoard({ rows }: { rows: AgeRow[] }) {
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  /* The last change that went through — said on the board once the dialog closes. */
  const [done, setDone] = useState<{ n: number; message: string } | null>(null);

  const index = useMemo(() => countryIndex(rows), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  /* The selected country, or the biggest one — and never one that's gone. */
  const country = picked && index.some((x) => x.country === picked) ? picked : index[0]?.country ?? null;
  const detail = useMemo(() => (country ? countryDetail(rows, country) : null), [rows, country]);
  const editingId = dialog?.kind === "edit" ? dialog.row.id : null;

  const load = (row: AgeRow) => {
    setPicked(row.countryCode);
    setDialog({ kind: "edit", row });
  };
  const pick = (hit: SearchHit) => {
    setPicked(hit.country);
    if (hit.row) load(hit.row);
  };

  return (
    <section aria-label="Age of majority by place" className="space-y-4">
      <div className="sx-ops-in flex flex-col gap-3 lg:flex-row lg:items-center" style={at(0.45)}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff] lg:mr-auto">Age of majority by place</h2>
        <GlobalSearch rows={rows} onPick={pick} />
        <button
          type="button"
          onClick={() => setDialog({ kind: "add" })}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-4 text-sm font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] ${CHAMFER}`}
        >
          <span aria-hidden="true" className="text-base leading-none">+</span> Add a place
        </button>
      </div>

      {done && (
        <p key={done.n} role="status" className="sx-pop flex items-center gap-2 rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-3.5 py-2 text-xs text-[#bbf7d0]">
          <span aria-hidden="true" className="text-[#86efac]">✓</span>
          {done.message}
          <button type="button" onClick={() => setDone(null)} aria-label="Dismiss" className="ml-auto text-[#86efac] hover:text-white">×</button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <CountryRail index={index} selected={country} onSelect={setPicked} />
        {detail && <CountryPanel key={detail.country} detail={detail} editingId={editingId} onLoad={load} />}
      </div>

      {dialog && (
        <PlaceDialog
          key={dialog.kind === "edit" ? dialog.row.id : "add"}
          mode={dialog}
          rows={rows}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setDone((d) => ({ n: (d?.n ?? 0) + 1, message }));
          }}
        />
      )}
    </section>
  );
}

/* --------------------------------------------------------------- search */

function GlobalSearch({ rows, onPick }: { rows: AgeRow[]; onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchPlaces(rows, q), [rows, q]);
  const choose = (h: SearchHit) => {
    onPick(h);
    setQ("");
    setOpen(false);
  };
  return (
    <div
      className="relative w-full lg:w-[26rem]"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      onKeyDown={(e) => {
        if (!open || hits.length === 0) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
        if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
        if (e.key === "Enter") { e.preventDefault(); choose(hits[active]!); }
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <SearchInput
        value={q}
        onChange={(v) => { setQ(v); setOpen(true); setActive(0); }}
        label="Search every country"
        placeholder="Search any place — AL, Alberta, Mexico…"
        tone="admin"
        className="w-full"
      />
      {open && q.trim() && (
        <div role="listbox" aria-label="Places found" className="sx-pop absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[#63b4f8]/35 bg-[#060b14]/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,.6)] backdrop-blur-md">
          {hits.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-[#8a96a3]">Nothing matches “{q.trim()}”. Add it with the form above.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.country}-${h.row?.id ?? "country"}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs ${i === active ? "bg-[#2e9bf5]/20" : ""}`}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-2 font-mono font-semibold text-[#9be0ff]">{h.row?.regionCode || h.country}</span>
                  <span className="text-white">{h.title}</span>
                </span>
                <span className={`shrink-0 text-[11px] ${h.exception ? "font-semibold text-[#fdba74]" : "text-[#7e88a0]"}`}>{h.detail}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- rail */

function CountryRail({ index, selected, onSelect }: { index: CountryEntry[]; selected: string | null; onSelect: (country: string) => void }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = index.filter((x) => (!only || x.not18) && (!needle || x.country.toLowerCase().includes(needle) || x.name.toLowerCase().includes(needle)));
  const not18 = index.filter((x) => x.not18).length;
  return (
    /* Same height as the country panel beside it (owner, 2026-10-05): from lg
       the rail is pinned to its grid cell (absolute, inset 0), so its long
       list never sets the row's height — the panel does, with a shared floor
       — and the list scrolls inside. Below lg it stacks with its own cap. */
    <div className="relative lg:min-h-[34rem]">
    <nav aria-label="Countries" className="sx-ops-panel sx-ops-in relative flex max-h-[22rem] flex-col p-3 lg:absolute lg:inset-0 lg:max-h-none" style={at(0.5)}>
      <SearchInput value={q} onChange={setQ} label="Filter countries" placeholder="Filter countries…" tone="admin" className="w-full" />
      <div role="radiogroup" aria-label="Which countries" className="mt-2.5 flex gap-1.5">
        {[{ v: false, label: `All · ${index.length}` }, { v: true, label: `Not 18 · ${not18}` }].map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={only === o.v} onClick={() => setOnly(o.v)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${only === o.v ? "border-[#63b4f8] bg-[#2e9bf5]/25 text-white" : "border-[#63b4f8]/25 text-[#cfe9ff] hover:border-[#63b4f8]/60"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <ul className="mt-2.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 [scrollbar-color:rgba(99,180,248,.35)_transparent] [scrollbar-width:thin]">
        {shown.length === 0 && <li className="px-2 py-3 text-xs text-[#8a96a3]">No country matches.</li>}
        {shown.map((x) => {
          const on = x.country === selected;
          return (
            <li key={x.country}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onSelect(x.country)}
                className={`grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-[#2e9bf5]/20 shadow-[inset_3px_0_0_#9be0ff]" : "hover:bg-white/[0.04]"}`}
              >
                <span className="font-mono text-[11px] font-semibold text-[#9be0ff]">{x.country}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-white">{x.name}</span>
                  <span className="block truncate text-[10px] text-[#7e88a0]">
                    {x.places === 1 && x.defaultAge !== null ? "whole country" : plural(x.places, "place", "places")}
                    {x.defaultAge !== null && x.places > 1 ? ` · default ${x.defaultAge}` : ""}
                  </span>
                </span>
                {x.exceptions > 0 ? (
                  <span className="rounded-full border border-[#f97a1f]/40 bg-[#f97a1f]/15 px-2 py-0.5 text-[10px] font-semibold text-[#fdba74]">
                    {plural(x.exceptions, "exception", "exceptions")}
                  </span>
                ) : x.defaultAge !== null ? (
                  <span className={`font-mono text-sm font-bold ${BAND[ageBand(x.defaultAge)].age}`}>{x.defaultAge}</span>
                ) : (
                  <span className="text-[10px] text-[#7e88a0]">by state</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
    </div>
  );
}

/* --------------------------------------------------------------- detail */

const TABS: { key: PlaceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "exceptions", label: "Exceptions" },
  { key: "following", label: "Follow the default" },
];

function CountryPanel({ detail, editingId, onLoad }: { detail: CountryDetail; editingId: string | null; onLoad: (row: AgeRow) => void }) {
  const { defaultRow, exceptions, following } = detail;
  /* With no whole-country row there is no default to follow: one list, no tabs. */
  const tabbed = defaultRow !== null && exceptions.length + following.length > 0;
  const [tab, setTab] = useState<PlaceFilter>("all");
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  /* From the bottom pager, a new page starts at the top of the list — not
     twenty cards below where the eye is. */
  const turn = (where: "top" | "bottom") => (n: number) => {
    setPage(n);
    if (where === "bottom") topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const list = placeList(detail, tabbed ? tab : "all");
  const view = placePage(list, page);
  const total = exceptions.length + following.length + (defaultRow ? 1 : 0);
  const count = (k: PlaceFilter) => (k === "all" ? exceptions.length + following.length : k === "exceptions" ? exceptions.length : following.length);
  const choose = (k: PlaceFilter) => {
    setTab(k);
    setPage(1);
  };

  const pager = (where: "top" | "bottom") =>
    view.total > 0 && (
      <div className={`flex flex-wrap items-center justify-end gap-3 ${where === "bottom" ? "mt-4" : ""}`}>
        {where === "top" && (
          <p className="mr-auto text-[11px] text-[#8a96a3]" aria-live="polite">
            Showing {view.start}–{view.end} of {view.total}
          </p>
        )}
        <Pagination page={view.page} count={view.pages} onChange={turn(where)} tone="admin" alwaysShow />
      </div>
    );

  return (
    <div className="sx-ops-panel sx-ops-in relative px-5 pb-5 pt-4 lg:min-h-[34rem]" style={at(0.55)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold text-white">{detail.name}</h3>
        <span className="text-xs text-[#8a96a3]">
          {plural(total, "place", "places")}
          {defaultRow ? ` · ${plural(exceptions.length, "exception", "exceptions")}` : ""}
        </span>
      </div>

      {defaultRow ? (
        <button
          type="button"
          onClick={() => onLoad(defaultRow)}
          aria-pressed={editingId === defaultRow.id}
          aria-label={`Change ${placeLabel(defaultRow)} — adult at ${defaultRow.age}`}
          className={`mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3.5 py-2 text-left transition-[border-color,box-shadow] hover:border-[#9be0ff] ${editingId === defaultRow.id ? "border-[#9be0ff] shadow-[0_0_18px_rgba(46,155,245,.5)]" : "border-[#63b4f8]/30 bg-[#2e9bf5]/10"}`}
        >
          <span className="text-[11px] text-[#9aa4b2]">Default for {detail.name}</span>
          <span className={`text-xl font-bold tabular-nums ${BAND[ageBand(defaultRow.age)].age}`}>{defaultRow.age}</span>
          <span className="text-[11px] text-[#7e88a0]">{exceptions.length + following.length ? "· every place not listed as an exception" : "· the whole country"}</span>
        </button>
      ) : (
        <p className="mt-3 text-[11px] text-[#7e88a0]">No whole-country age — each place below has its own. A place not listed counts as 18.</p>
      )}

      {(list.length > 0 || tabbed) && (
        <div ref={topRef} className="mt-5 scroll-mt-24 space-y-3">
          {tabbed && (
            <div role="tablist" aria-label={`Places in ${detail.name}`} className="flex flex-wrap gap-1.5">
              {TABS.map((t) => {
                const on = t.key === tab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => choose(t.key)}
                    className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color] ${
                      on
                        ? t.key === "exceptions"
                          ? "border-[#fb923c] bg-[#f97a1f]/20 text-[#ffd1a6]"
                          : "border-[#63b4f8] bg-[#2e9bf5]/25 text-white"
                        : "border-[#63b4f8]/25 bg-[#0a121e]/60 text-[#cfe9ff] hover:border-[#63b4f8]/60"
                    }`}
                  >
                    {t.label}
                    <span className="font-mono text-[11px] text-[#7e88a0]">{count(t.key)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {pager("top")}
          {view.rows.length === 0 ? (
            <p className="rounded-lg border border-white/10 px-4 py-5 text-sm text-[#9aa4b2]">
              {tab === "exceptions" ? `Every place in ${detail.name} follows its default.` : "Nothing here."}
            </p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {view.rows.map((p, i) => (
                <PlaceCard key={p.id} row={p} detail={detail} lit={editingId === p.id} onLoad={() => onLoad(p)} delay={0.05 + i * 0.025} />
              ))}
            </ul>
          )}
          {view.pages > 1 && pager("bottom")}
        </div>
      )}
    </div>
  );
}

/** One place, large: its code and name, its age, how it stands against the
 *  default, and who set it when. Clicking loads it into the form. */
function PlaceCard({ row, detail, lit, onLoad, delay }: { row: AgeRow; detail: CountryDetail; lit: boolean; onLoad: () => void; delay: number }) {
  const band = BAND[ageBand(row.age)];
  const status = statusWords(row, detail);
  const nm = regionName(row.countryCode, row.regionCode);
  return (
    <li className="sx-ops-in" style={at(delay)}>
      <button
        type="button"
        onClick={onLoad}
        aria-pressed={lit}
        aria-label={`Change ${placeLabel(row)} — adult at ${row.age}`}
        className={`group flex h-full w-full items-stretch gap-3 border px-3.5 py-3 text-left transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#9be0ff] hover:shadow-[0_0_18px_rgba(46,155,245,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 ${
          status.exception ? band.tile : "border-[#63b4f8]/20 bg-[#0a121e]/60"
        } ${lit ? "!border-[#9be0ff] shadow-[0_0_22px_rgba(46,155,245,.55)] ring-1 ring-[#9be0ff]/70" : ""} ${CHAMFER}`}
      >
        <span className={`grid size-12 shrink-0 place-items-center border font-mono text-sm font-bold tracking-[0.06em] ${band.tile} ${band.age} [clip-path:polygon(0_0,calc(100%-6px)_0,100%_6px,100%_100%,6px_100%,0_calc(100%-6px))]`}>
          {row.regionCode || row.countryCode}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-white">{nm ?? (row.regionCode || detail.name)}</span>
            <span className={`shrink-0 text-2xl font-bold leading-none tabular-nums ${band.age}`}>{row.age}</span>
          </span>
          <span className={`mt-1 block truncate text-[11px] ${status.exception ? "font-semibold text-[#fdba74]" : "text-[#9aa4b2]"}`}>{status.text}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[#6b7785]">{changedWords(row)}</span>
        </span>
      </button>
    </li>
  );
}
