"use client";

/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority board (P1-ART-17, the Control Panel).
   One client island so anything picked can fill the form.

   BUILT FOR SCALE (owner, 2026-10-05: "what if there are more countries and
   more states / provinces"). The page never lays out the whole table:

   - PlaceForm   country + state (mono caps), an age stepper (14–25, arrow
                 keys), "Save place" / "Change AL, US", and — for a place
                 already in the table — "Remove AL, US" with a confirm. All
                 through the existing server actions; the API accepts BTG
                 admins only and audits each change.
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

   Picking anything is never a silent scroll (owner, twice — memory
   "scroll-to-needs-a-loud-cue"): the form glows and pulses, a lit callout
   names the place with numbered next steps and a Cancel, the stepper is
   ringed, the picked tile or chip stays lit, and a live region says it.
   -------------------------------------------------------------------------- */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { removeAgeRowAction, setAgeRowAction } from "@/app/(app)/admin/new-signups/rules/actions";
import { SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import { Said, useRun } from "@/components/signup-rules-editor";
import {
  ageBand, changedWords, countryDetail, countryIndex, placeLabel, placeList, placeName, placePage, regionName, searchPlaces, statusWords,
  type AgeBand, type AgeRow, type CountryDetail, type CountryEntry, type PlaceFilter, type SearchHit,
} from "@/lib/age-table";

const MIN = 14;
const MAX = 25;
const CHAMFER = "[clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]";
const FIELD =
  "min-h-10 w-full rounded-lg border border-[#63b4f8]/30 bg-[#04080f]/70 px-3 font-mono text-sm font-semibold uppercase tracking-[0.12em] text-white placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:text-[#5b6b7d] focus:border-[#9be0ff] focus:outline-none focus:ring-2 focus:ring-[#63b4f8]/40";

const BAND: Record<AgeBand, { tile: string; age: string }> = {
  young: { tile: "border-[#a479ff]/45 bg-[#a479ff]/10", age: "text-[#c3a6ff]" },
  eighteen: { tile: "border-[#63b4f8]/22 bg-[#0a121e]/60", age: "text-[#93c5fd]" },
  nineteen: { tile: "border-[#9be0ff]/55 bg-[#9be0ff]/[0.08]", age: "text-[#9be0ff]" },
  older: { tile: "border-[#fb923c]/60 bg-[#f97a1f]/[0.12]", age: "text-[#fdba74]" },
};
const at = (s: number) => ({ "--sx-reveal-delay": `${s}s` }) as CSSProperties;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `aside`: the panel beside the form (the minors switch) — the two controls share a row. */
export function RulesBoard({ rows, aside }: { rows: AgeRow[]; aside?: ReactNode }) {
  /* Empty at rest: an "Add a place" form, not a preloaded US row. */
  const [c, setC] = useState("");
  const [r, setR] = useState("");
  const [age, setAge] = useState(18);
  const save = useRun();
  const del = useRun();
  const [armRemove, setArmRemove] = useState(false);
  /* Bumped each time something loads into the form — keys the flash so its
     pulse replays, and tells the form it is answering a pick. */
  const [pulse, setPulse] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const ageRef = useRef<HTMLButtonElement>(null);

  const index = useMemo(() => countryIndex(rows), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  /* The selected country, or the biggest one — and never one that's gone. */
  const country = picked && index.some((x) => x.country === picked) ? picked : index[0]?.country ?? null;
  const detail = useMemo(() => (country ? countryDetail(rows, country) : null), [rows, country]);

  const existing = rows.find((x) => x.countryCode === c.trim().toUpperCase() && x.regionCode === r.trim().toUpperCase());
  /* A picked place is in the form (not just a typed code that happens to exist). */
  const editing = pulse > 0 && existing !== undefined;

  const load = (row: AgeRow) => {
    setC(row.countryCode);
    setR(row.regionCode);
    setAge(row.age);
    setPicked(row.countryCode);
    save.clear();
    del.clear();
    setArmRemove(false);
    setPulse((n) => n + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ageRef.current?.focus({ preventScroll: true });
  };
  const step = (d: number) => setAge((a) => Math.min(MAX, Math.max(MIN, a + d)));
  const fresh = () => {
    setC("");
    setR("");
    setAge(18);
    setPulse(0);
    setArmRemove(false);
    save.clear();
  };
  const pick = (hit: SearchHit) => {
    setPicked(hit.country);
    if (hit.row) load(hit.row);
  };

  return (
    <div className="space-y-8">
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {aside}
        {/* ---------------------------------------------------------- form */}
        {/* The wrapper carries the glow: the panel's chamfer clip would cut a
            shadow of its own off. Lit while a picked place is in the form. */}
        <div className="relative">
          {editing && (
            <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-xl bg-gradient-to-br from-[#2e9bf5]/50 via-[#9be0ff]/25 to-[#2e9bf5]/40 blur-lg" />
          )}
          <form
            ref={formRef}
            aria-labelledby="sr-place"
            className={`sx-ops-panel sx-ops-in relative h-full px-5 pb-5 pt-4 ${editing ? "!bg-[linear-gradient(160deg,rgba(24,52,88,.92),rgba(8,18,34,.9))]" : ""}`}
            style={at(0.38)}
            onSubmit={(e) => {
              e.preventDefault();
              del.clear();
              save.run(() => setAgeRowAction({ countryCode: c, regionCode: r, age }));
            }}
          >
            {pulse > 0 && <span key={`flash-${pulse}`} aria-hidden="true" className="sx-ops-flash absolute inset-0" />}
            <h2 id="sr-place" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff]">
              {existing ? "Change a place" : "Add a place"}
            </h2>

            {editing && existing && (
              <div key={`hint-${pulse}`} className="sx-pop relative mt-3 overflow-hidden rounded-lg border border-[#9be0ff]/70 bg-gradient-to-r from-[#2e9bf5]/35 via-[#2e9bf5]/15 to-transparent px-4 py-3 shadow-[0_0_24px_rgba(46,155,245,.35)]">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[#9be0ff] shadow-[0_0_12px_#9be0ff]" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-bold text-white">
                    Editing {placeName(existing)} <span className="font-semibold text-[#9be0ff]">— adult at {existing.age}</span>
                  </p>
                  <button type="button" onClick={fresh} className="rounded-md border border-white/25 px-2.5 py-1 text-[11px] font-semibold text-[#cfe9ff] transition-colors hover:border-white/60 hover:text-white">
                    Cancel · new place
                  </button>
                </div>
                <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-medium text-[#e0f2ff]">
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-[#9be0ff] text-[11px] font-bold text-[#04070e]">1</span>
                    Set the new age with − / +
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-[#9be0ff] text-[11px] font-bold text-[#04070e]">2</span>
                    Press <strong className="text-white">Change {placeLabel(existing)}</strong>
                  </li>
                </ol>
              </div>
            )}
            <p aria-live="polite" className="sr-only">
              {editing && existing ? `Editing ${placeName(existing)}, adult at ${existing.age}. Set the new age, then press Change ${placeLabel(existing)}.` : ""}
            </p>

            <div className="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-[6rem_8rem_auto]">
              <label className="text-[11px] font-medium text-[#8a96a3]">
                Country
                <input className={`${FIELD} mt-1`} value={c} maxLength={2} placeholder="US" onChange={(e) => { setC(e.target.value); setArmRemove(false); }} aria-describedby="age-hint" />
              </label>
              <label className="text-[11px] font-medium text-[#8a96a3]">
                State or province
                <input className={`${FIELD} mt-1`} value={r} maxLength={3} placeholder="All" onChange={(e) => { setR(e.target.value); setArmRemove(false); }} />
              </label>
              <div className="text-[11px] font-medium text-[#8a96a3]">
                <span id="age-label">Adult at</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <button type="button" aria-label="One year younger" onClick={() => step(-1)} disabled={age <= MIN}
                    className="grid size-10 place-items-center rounded-lg border border-[#63b4f8]/30 text-lg text-[#cfe9ff] transition-colors hover:border-[#9be0ff] disabled:opacity-30">−</button>
                  <button
                    ref={ageRef}
                    type="button"
                    role="spinbutton"
                    aria-labelledby="age-label"
                    aria-valuenow={age}
                    aria-valuemin={MIN}
                    aria-valuemax={MAX}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); step(1); }
                      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
                    }}
                    className={`relative h-10 w-14 rounded-md text-center text-2xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/60 ${BAND[ageBand(age)].age} ${editing ? "bg-[#2e9bf5]/15 ring-2 ring-[#9be0ff] shadow-[0_0_16px_rgba(155,224,255,.6)]" : ""}`}
                  >
                    {age}
                  </button>
                  <button type="button" aria-label="One year older" onClick={() => step(1)} disabled={age >= MAX}
                    className="grid size-10 place-items-center rounded-lg border border-[#63b4f8]/30 text-lg text-[#cfe9ff] transition-colors hover:border-[#9be0ff] disabled:opacity-30">+</button>
                </div>
              </div>
              <button
                type="submit"
                disabled={save.pending || del.pending}
                className={`col-span-full min-h-11 truncate bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-5 text-sm font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] disabled:opacity-50 ${CHAMFER}`}
              >
                {save.pending ? "Saving…" : existing ? `Change ${placeLabel(existing)}` : "Save place"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p id="age-hint" className="text-[11px] text-[#7e88a0]">
                Two-letter codes (US, AL). Leave the state empty for the whole country. Saving an existing place changes its age.
              </p>
              {existing && (
                armRemove ? (
                  <span className="sx-pop flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-[#fca5a5]">Remove {placeLabel(existing)}?</span>
                    <button
                      type="button"
                      disabled={del.pending}
                      onClick={() => del.run(async () => {
                        const res = await removeAgeRowAction(existing.id);
                        if (res.ok) fresh();
                        return res;
                      })}
                      className="rounded-md bg-[#ef4444] px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                    >
                      {del.pending ? "Removing…" : "Remove"}
                    </button>
                    <button type="button" onClick={() => setArmRemove(false)} className="rounded-md border border-white/20 px-2.5 py-1 font-medium text-[#cfe9ff]">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => { setArmRemove(true); del.clear(); }}
                    className="rounded-md border border-[#ef4444]/45 px-2.5 py-1 text-[11px] font-semibold text-[#fca5a5] transition-colors hover:bg-[#ef4444]/15">
                    Remove {placeLabel(existing)}
                  </button>
                )
              )}
            </div>
            <div className="mt-2 space-y-1"><Said r={save.result} /><Said r={del.result} /></div>
          </form>
        </div>
      </div>

      {/* ------------------------------------------------- search + browse */}
      <section aria-label="Age of majority by place" className="space-y-4">
        <div className="sx-ops-in flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={at(0.45)}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff]">Age of majority by place</h2>
          <GlobalSearch rows={rows} onPick={pick} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <CountryRail index={index} selected={country} onSelect={setPicked} />
          {detail && <CountryPanel key={detail.country} detail={detail} editingId={editing ? existing?.id ?? null : null} onLoad={load} />}
        </div>
      </section>
    </div>
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
    <nav aria-label="Countries" className="sx-ops-panel sx-ops-in relative flex max-h-[22rem] flex-col p-3 lg:max-h-[38rem]" style={at(0.5)}>
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
    <div className="sx-ops-panel sx-ops-in relative px-5 pb-5 pt-4" style={at(0.55)}>
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
