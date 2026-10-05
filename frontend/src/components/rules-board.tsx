"use client";

/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority board (P1-ART-17, the Control Panel).
   One client island so a tile can fill the form:

   - PlaceForm   country + state (mono caps) and an age stepper (14–25),
                 "Save place" — PUT /signup-rules/age-table through the
                 existing server action. Saving an existing place changes it.
   - the grid    age chips and a search, instant (the table is a bounded
                 catalogue — lib/age-table.ts), then one glass tile per place
                 by section — a country with states its own, every whole-
                 country-only place in one "Countries" section — banded by age.
                 Its "×" asks "Remove AL? Yes / No" inside the tile first.
   - picking     a tile loads into the form, which is scrolled to — and,
                 so the scroll is never a silent jump (owner, 2026-10-05),
                 the panel pulses with a glow, its heading becomes an
                 "Editing AL, US" badge (with "New place" to reset), a line
                 says what to do next, the picked tile stays lit, and screen
                 readers hear the same.

   The API accepts changes from a BTG admin only and audits each; a refusal
   shows its own words. The page re-reads after every change.
   -------------------------------------------------------------------------- */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { removeAgeRowAction, setAgeRowAction } from "@/app/(app)/admin/new-signups/rules/actions";
import { SearchInput } from "@/components/filter-kit";
import { Said, useRun } from "@/components/signup-rules-editor";
import { ageBand, ageChips, placeLabel, placeSections, type AgeBand, type AgeRow } from "@/lib/age-table";

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

/** `aside`: the panel beside the form (the minors switch) — the two controls share a row. */
export function RulesBoard({ rows, aside }: { rows: AgeRow[]; aside?: ReactNode }) {
  const [c, setC] = useState("US");
  const [r, setR] = useState("");
  const [age, setAge] = useState(18);
  const [filter, setFilter] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const save = useRun();
  /* Bumped each time a tile loads into the form — keys the flash overlay so
     its pulse replays, and tells the form it is answering a click. */
  const [pulse, setPulse] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const ageRef = useRef<HTMLButtonElement>(null);

  const chips = useMemo(() => ageChips(rows), [rows]);
  const groups = useMemo(() => placeSections(rows, { age: filter, q }), [rows, filter, q]);
  const existing = rows.find((x) => x.countryCode === c.trim().toUpperCase() && x.regionCode === r.trim().toUpperCase());
  /* A picked tile is in the form (not just a typed code that happens to exist). */
  const editing = pulse > 0 && existing !== undefined;

  const load = (row: AgeRow) => {
    setC(row.countryCode);
    setR(row.regionCode);
    setAge(row.age);
    save.clear();
    setPulse((n) => n + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ageRef.current?.focus({ preventScroll: true });
  };
  const step = (d: number) => setAge((a) => Math.min(MAX, Math.max(MIN, a + d)));
  const fresh = () => {
    setC("US");
    setR("");
    setAge(18);
    setPulse(0);
    save.clear();
  };

  return (
    <div className="space-y-8">
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
      {aside}
      {/* ------------------------------------------------------------ form */}
      {/* The wrapper carries the glow: the panel's chamfer clip would cut a
          shadow of its own off. Lit for as long as a picked place is in the
          form (owner, 2026-10-05: a scroll with no hint is a silent jump). */}
      <div className="relative">
        {editing && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1.5 rounded-xl bg-gradient-to-br from-[#2e9bf5]/50 via-[#9be0ff]/25 to-[#2e9bf5]/40 blur-lg"
          />
        )}
      <form
        ref={formRef}
        aria-labelledby="sr-place"
        className={`sx-ops-panel sx-ops-in relative h-full px-5 pb-5 pt-4 ${editing ? "!bg-[linear-gradient(160deg,rgba(24,52,88,.92),rgba(8,18,34,.9))]" : ""}`}
        style={{ "--sx-reveal-delay": "0.38s" } as CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          save.run(() => setAgeRowAction({ countryCode: c, regionCode: r, age }));
        }}
      >
        {/* The flash: a bright ring pulses as a tile loads, so the eye lands here. */}
        {pulse > 0 && <span key={`flash-${pulse}`} aria-hidden="true" className="sx-ops-flash absolute inset-0" />}
        <h2 id="sr-place" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff]">
          {existing ? "Change a place" : "Add or change a place"}
        </h2>

        {/* What to do next, impossible to miss: the place in big type and
            the two steps, on a lit bar across the panel. */}
        {editing && existing && (
          <div key={`hint-${pulse}`} className="sx-pop relative mt-3 overflow-hidden rounded-lg border border-[#9be0ff]/70 bg-gradient-to-r from-[#2e9bf5]/35 via-[#2e9bf5]/15 to-transparent px-4 py-3 shadow-[0_0_24px_rgba(46,155,245,.35)]">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[#9be0ff] shadow-[0_0_12px_#9be0ff]" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-bold text-white">
                Editing {placeLabel(existing)} <span className="font-semibold text-[#9be0ff]">— adult at {existing.age}</span>
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
          {editing && existing ? `Editing ${placeLabel(existing)}, adult at ${existing.age}. Set the new age, then press Change ${placeLabel(existing)}.` : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-[6rem_8rem_auto_auto]">
          <label className="text-[11px] font-medium text-[#8a96a3]">
            Country
            <input className={`${FIELD} mt-1`} value={c} maxLength={2} onChange={(e) => setC(e.target.value)} aria-describedby="age-hint" />
          </label>
          <label className="text-[11px] font-medium text-[#8a96a3]">
            State or province
            <input className={`${FIELD} mt-1`} value={r} maxLength={3} placeholder="All" onChange={(e) => setR(e.target.value)} />
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
            disabled={save.pending}
            className={`col-span-2 min-h-10 whitespace-nowrap bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-5 text-sm font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] disabled:opacity-50 sm:col-span-1 ${CHAMFER}`}
          >
            {save.pending ? "Saving…" : existing ? `Change ${placeLabel(existing)}` : "Save place"}
          </button>
        </div>
        <p id="age-hint" className="mt-3 text-[11px] text-[#7e88a0]">
          Two-letter codes (US, AL). Leave the state empty for the whole country. Saving an existing place changes its age{existing ? ` — ${placeLabel(existing)} is adult at ${existing.age} now` : ""}.
        </p>
        <div className="mt-2"><Said r={save.result} /></div>
      </form>
      </div>
      </div>

      {/* ----------------------------------------------------------- grid */}
      <section aria-label="Age of majority by place">
        <div className="sx-ops-in mb-4 flex flex-col gap-3 lg:flex-row lg:items-center" style={{ "--sx-reveal-delay": "0.45s" } as CSSProperties}>
          <div role="radiogroup" aria-label="Filter by age" className="flex flex-wrap gap-1.5">
            {chips.map((ch) => {
              const on = ch.age === filter;
              return (
                <button
                  key={ch.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFilter(ch.age)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-[background-color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 ${
                    on ? "border-[#63b4f8] bg-[#2e9bf5]/25 text-white shadow-[0_0_18px_rgba(46,155,245,.35)]" : "border-[#63b4f8]/25 bg-[#0a121e]/60 text-[#cfe9ff] hover:border-[#63b4f8]/60"
                  }`}
                >
                  {ch.age === null ? "All" : `Adult at ${ch.label}`}
                  <span className="font-mono text-[11px] text-[#7e88a0]">{ch.count}</span>
                </button>
              );
            })}
          </div>
          <div className="lg:ml-auto lg:w-72">
            <SearchInput value={q} onChange={setQ} label="Search a place" placeholder="Search a code — AL, BC, US…" tone="admin" />
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="sx-ops-panel relative px-6 py-6 text-sm text-[#9aa4b2]">No place matches — try another code or age.</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g, gi) => (
              <div key={g.key} role="region" aria-label={g.wholeCountries ? "Whole countries" : `Places in ${g.title}`}>
                <p className="mb-2.5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9be0ff]">
                  {g.title}
                  <span className="h-px flex-1 bg-gradient-to-r from-[#63b4f8]/40 to-transparent" />
                  <span className="font-mono tracking-normal text-[#7e88a0]">{g.places.length}</span>
                </p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                  {g.places.map((p, i) => (
                    <PlaceTile key={p.id} row={p} selected={editing && existing?.id === p.id} code={g.wholeCountries ? p.countryCode : undefined} onLoad={() => load(p)} delay={0.5 + gi * 0.08 + Math.min(i, 20) * 0.015} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** `code`: the tile's heading when the section already says what it is (Countries → "AU"). */
function PlaceTile({ row, code, selected, onLoad, delay }: { row: AgeRow; code?: string; selected: boolean; onLoad: () => void; delay: number }) {
  const [arm, setArm] = useState(false);
  const del = useRun();
  const band = BAND[ageBand(row.age)];
  const name = placeLabel(row);
  return (
    <li className="sx-ops-in group relative" style={{ "--sx-reveal-delay": `${delay}s` } as CSSProperties}>
      {arm ? (
        <div className={`flex h-full min-h-[4.75rem] flex-col items-center justify-center gap-1.5 border border-[#ef4444]/60 bg-[#ef4444]/12 px-1.5 py-2 text-center ${CHAMFER}`}>
          <span className="text-[11px] font-semibold text-[#fca5a5]">Remove {row.regionCode || `all of ${row.countryCode}`}?</span>
          <span className="flex gap-1.5">
            <button type="button" disabled={del.pending} onClick={() => del.run(() => removeAgeRowAction(row.id))}
              className="rounded-md bg-[#ef4444] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50">
              {del.pending ? "…" : "Yes"}
            </button>
            <button type="button" onClick={() => { setArm(false); del.clear(); }}
              className="rounded-md border border-white/20 px-2 py-0.5 text-[11px] font-medium text-[#cfe9ff]">No</button>
          </span>
          {del.result && !del.result.ok && <span className="text-[10px] leading-tight text-[#fca5a5]">{del.result.message}</span>}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onLoad}
            aria-label={`Change ${name} — adult at ${row.age}`}
            aria-pressed={selected}
            className={`flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center border px-1.5 py-2 text-center transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#9be0ff] hover:shadow-[0_0_18px_rgba(46,155,245,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 ${band.tile} ${
              selected ? "!border-[#9be0ff] shadow-[0_0_22px_rgba(46,155,245,.55)] ring-1 ring-[#9be0ff]/70" : ""
            } ${CHAMFER}`}
          >
            <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[#cfe9ff]">{code ?? (row.regionCode || `ALL ${row.countryCode}`)}</span>
            <span className={`text-2xl font-bold leading-none tabular-nums ${band.age}`}>{row.age}</span>
          </button>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={() => setArm(true)}
            className="absolute right-1 top-1 grid size-5 place-items-center rounded-full text-[11px] text-[#7e88a0] opacity-0 transition-opacity hover:bg-[#ef4444]/20 hover:text-[#fca5a5] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
