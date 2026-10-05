"use client";

/* --------------------------------------------------------------------------
   The sign-up rules' place dialog (P1-ART-17) — "Add a place" and "Change a
   place" as one modal (owner, 2026-10-05: "this is better if this is a
   popup … for creating new place, what if I put xyz since this is a free
   input, it should be dropdown and listing all of the available countries in
   the world").

   - ADD: the country is a searchable dropdown of every country in the world
     (lib countryOptions — ISO codes named by the browser), the state or
     province a dropdown of "Whole country" plus the country's real
     subdivisions where SponsorX knows their names (lib regionOptions);
     otherwise the whole country only. Nothing can be typed that isn't a
     place. Choosing a place already in the table turns the dialog into
     changing it, and says so.
   - CHANGE: the place is fixed and named; only the age moves; Remove, with a
     confirm, sits in the footer.

   House dialog contract (useDialogFocus): focus moves in and is trapped,
   Escape and the backdrop close, the page stops scrolling, focus returns to
   the opener. A dropdown's own Escape closes the dropdown first. Portaled to
   <body> with `.sx-ops`, so it is the night stage in both themes.
   -------------------------------------------------------------------------- */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { removeAgeRowAction, setAgeRowAction, type RuleResult } from "@/app/(app)/admin/new-signups/rules/actions";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { useMounted } from "@/components/use-mounted";
import { ageBand, countryName, countryOptions, filterOptions, placeLabel, placeName, regionOptions, type AgeRow, type Option } from "@/lib/age-table";

const MIN = 14;
const MAX = 25;
const CHAMFER = "[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]";
const AGE_TEXT = { young: "text-[#c3a6ff]", eighteen: "text-[#93c5fd]", nineteen: "text-[#9be0ff]", older: "text-[#fdba74]" } as const;
const WHOLE = "";

export type DialogMode = { kind: "add" } | { kind: "edit"; row: AgeRow };

export function PlaceDialog({
  mode, rows, onClose, onDone,
}: {
  mode: DialogMode;
  rows: AgeRow[];
  onClose: () => void;
  /** A change went through: the board closes the dialog and shows this. */
  onDone: (message: string) => void;
}) {
  const mounted = useMounted();
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const editing = mode.kind === "edit" ? mode.row : null;

  const [country, setCountry] = useState<string>(editing?.countryCode ?? "");
  const [region, setRegion] = useState<string>(editing?.regionCode ?? WHOLE);
  const [age, setAge] = useState<number>(editing?.age ?? 18);
  const [result, setResult] = useState<RuleResult | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [armRemove, setArmRemove] = useState(false);

  /* The place the dialog is about — the edited row, or one already in the
     table that the add choices landed on. */
  const existing = editing ?? rows.find((r) => r.countryCode === country && r.regionCode === region) ?? null;
  const countries = useMemo(() => countryOptions(), []);
  const regions = useMemo(() => (country ? regionOptions(country) : []), [country]);
  const inTable = useMemo(() => new Map(rows.map((r) => [`${r.countryCode}-${r.regionCode}`, r])), [rows]);
  const label = country ? placeLabel({ countryCode: country, regionCode: region }) : "";

  const pickCountry = (code: string) => {
    setCountry(code);
    setRegion(WHOLE);
    setResult(null);
    const there = inTable.get(`${code}-`);
    if (there) setAge(there.age);
  };
  const pickRegion = (code: string) => {
    setRegion(code);
    setResult(null);
    const there = inTable.get(`${country}-${code}`);
    if (there) setAge(there.age);
  };
  const step = (d: number) => setAge((a) => Math.min(MAX, Math.max(MIN, a + d)));

  const save = async () => {
    if (!country || busy) return;
    setBusy("save");
    const res = await setAgeRowAction({ countryCode: country, regionCode: region, age });
    setBusy(null);
    if (res.ok) onDone(`${placeName({ countryCode: country, regionCode: region })} — adult at ${age}. ${res.message}`);
    else setResult(res);
  };
  const remove = async () => {
    if (!existing || busy) return;
    setBusy("remove");
    const res = await removeAgeRowAction(existing.id);
    setBusy(null);
    if (res.ok) onDone(`${placeName(existing)} removed. ${res.message}`);
    else setResult(res);
  };

  if (!mounted) return null;
  return createPortal(
    <div className="sx-ops fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-[#02050b]/75" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-dialog-title"
        className="sx-pop relative w-full max-w-lg"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-br from-[#2e9bf5]/45 via-[#9be0ff]/15 to-[#f97a1f]/25 blur-xl" />
        <div className={`relative bg-[radial-gradient(90%_60%_at_0%_0%,rgba(46,155,245,.22),transparent_70%),linear-gradient(160deg,#0c1828,#060b14)] px-6 pb-6 pt-5 ${CHAMFER}`}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-[#63b4f8]/35 [clip-path:inherit]" />

          {/* ------------------------------------------------------ header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9be0ff]">
                {editing ? "Change a place" : existing ? "Already in the table — changing it" : "Add a place"}
              </p>
              <h2 id="place-dialog-title" className="mt-1.5 truncate text-xl font-semibold text-white">
                {editing ? placeName(editing) : country ? placeName({ countryCode: country, regionCode: region }) : "Choose a country"}
              </h2>
              {existing && (
                <p className="mt-0.5 text-xs text-[#8a96a3]">
                  Adult at <span className={`font-semibold ${AGE_TEXT[ageBand(existing.age)]}`}>{existing.age}</span> now · {placeLabel(existing)}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-[#cfe9ff] transition-colors hover:border-white/40 hover:text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          {/* ------------------------------------------------- where (add) */}
          {!editing && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ComboBox
                label="Country"
                placeholder="Choose a country"
                options={countries}
                value={country}
                onPick={pickCountry}
                note={(o) => inTable.has(`${o.code}-`) ? `in table · ${inTable.get(`${o.code}-`)!.age}` : null}
                autoFocus
              />
              <ComboBox
                label="State or province"
                placeholder={country ? "Whole country" : "Choose a country first"}
                options={[{ code: WHOLE, name: "Whole country" }, ...regions]}
                value={region}
                onPick={pickRegion}
                disabled={!country}
                note={(o) => inTable.has(`${country}-${o.code}`) ? `in table · ${inTable.get(`${country}-${o.code}`)!.age}` : null}
              />
              {country && regions.length === 0 && (
                <p className="sm:col-span-2 text-[11px] text-[#7e88a0]">
                  SponsorX has no state list for {countryName(country)} — its age is set for the whole country.
                </p>
              )}
            </div>
          )}

          {/* --------------------------------------------------------- age */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <span id="dialog-age-label" className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#8a96a3]">Adult at</span>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="One year younger" onClick={() => step(-1)} disabled={age <= MIN}
                className="grid size-12 place-items-center rounded-xl border border-[#63b4f8]/35 text-2xl text-[#cfe9ff] transition-colors hover:border-[#9be0ff] disabled:opacity-30">−</button>
              <span
                role="spinbutton"
                tabIndex={0}
                data-autofocus={editing ? "" : undefined}
                aria-labelledby="dialog-age-label"
                aria-valuenow={age}
                aria-valuemin={MIN}
                aria-valuemax={MAX}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); step(1); }
                  if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
                }}
                className={`grid h-16 w-24 place-items-center rounded-xl border-2 border-[#9be0ff]/70 bg-[#2e9bf5]/12 text-5xl font-bold tabular-nums shadow-[0_0_24px_rgba(155,224,255,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9be0ff] ${AGE_TEXT[ageBand(age)]}`}
              >
                {age}
              </span>
              <button type="button" aria-label="One year older" onClick={() => step(1)} disabled={age >= MAX}
                className="grid size-12 place-items-center rounded-xl border border-[#63b4f8]/35 text-2xl text-[#cfe9ff] transition-colors hover:border-[#9be0ff] disabled:opacity-30">+</button>
            </div>
            <span className="text-[11px] text-[#7e88a0]">Between {MIN} and {MAX}. Saving works the age out again for the athletes who live there.</span>
          </div>

          {result && !result.ok && (
            <p role="alert" className="sx-pop mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5]">{result.message}</p>
          )}

          {/* ------------------------------------------------------ footer */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {existing && (
              armRemove ? (
                <span className="sx-pop flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-[#fca5a5]">Remove {placeLabel(existing)}?</span>
                  <button type="button" disabled={busy !== null} onClick={remove} className="rounded-md bg-[#ef4444] px-2.5 py-1 font-semibold text-white disabled:opacity-50">
                    {busy === "remove" ? "Removing…" : "Remove"}
                  </button>
                  <button type="button" onClick={() => setArmRemove(false)} className="rounded-md border border-white/20 px-2.5 py-1 font-medium text-[#cfe9ff]">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setArmRemove(true)} className="rounded-md border border-[#ef4444]/45 px-2.5 py-1.5 text-[11px] font-semibold text-[#fca5a5] transition-colors hover:bg-[#ef4444]/15">
                  Remove {placeLabel(existing)}
                </button>
              )
            )}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-[#cfe9ff] transition-colors hover:text-white">Cancel</button>
              <button
                type="button"
                onClick={save}
                disabled={!country || busy !== null}
                className="min-h-10 whitespace-nowrap bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-5 text-sm font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] disabled:cursor-not-allowed disabled:opacity-40 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]"
              >
                {busy === "save" ? "Saving…" : !country ? "Choose a country" : existing ? `Change ${label}` : `Add ${label}`}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------- ComboBox */

/** A designed, searchable dropdown (no native <select>): a trigger showing
 *  the choice, and a popover with a filter box and a listbox — ↑ ↓ ⏎, Esc
 *  closes the list (not the dialog). */
function ComboBox({
  label, placeholder, options, value, onPick, note, disabled = false, autoFocus = false,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  onPick: (code: string) => void;
  note?: (o: Option) => string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => filterOptions(options, q).slice(0, 300), [options, q]);
  const chosen = options.find((o) => o.code === value) ?? null;
  const id = `combo-${label.replace(/\W+/g, "-").toLowerCase()}`;

  const close = (refocus = true) => {
    setOpen(false);
    setQ("");
    if (refocus) trigger.current?.focus();
  };
  const choose = (o: Option) => {
    onPick(o.code);
    close();
  };
  const move = (d: number) => {
    setActive((i) => {
      const n = Math.min(shown.length - 1, Math.max(0, i + d));
      list.current?.children[n]?.scrollIntoView({ block: "nearest" });
      return n;
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    if (e.key === "Enter" && shown[active]) { e.preventDefault(); choose(shown[active]); }
  };

  return (
    <div className="relative" onBlur={(e) => { if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) close(false); }}>
      <span id={`${id}-label`} className="mb-1 block text-[11px] font-medium text-[#8a96a3]">{label}</span>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        data-autofocus={autoFocus ? "" : undefined}
        onClick={() => { setOpen((v) => !v); setActive(Math.max(0, shown.findIndex((o) => o.code === value))); }}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${open ? "border-[#9be0ff] bg-[#0a1626]" : "border-[#63b4f8]/30 bg-[#04080f]/70 hover:border-[#63b4f8]/60"}`}
      >
        <span id={`${id}-value`} className="flex min-w-0 flex-1 items-center gap-2">
          {chosen ? (
            <>
              {chosen.code && <span className="font-mono text-xs font-semibold text-[#9be0ff]">{chosen.code}</span>}
              <span className="truncate font-medium text-white">{chosen.name}</span>
            </>
          ) : (
            <span className="text-[#5b6b7d]">{placeholder}</span>
          )}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`size-4 shrink-0 text-[#8a96a3] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="sx-pop absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-[#63b4f8]/40 bg-[#060b14] shadow-[0_18px_40px_rgba(0,0,0,.65)]" onKeyDown={onKey}>
          <div className="border-b border-white/5 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={`${id}-list`}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full rounded-md border border-[#63b4f8]/25 bg-[#04080f] px-2.5 py-1.5 text-xs text-white placeholder:text-[#5b6b7d] focus:border-[#9be0ff] focus:outline-none"
            />
          </div>
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1 [scrollbar-color:rgba(99,180,248,.35)_transparent] [scrollbar-width:thin]">
            {shown.length === 0 && <li className="px-3 py-2 text-xs text-[#8a96a3]">Nothing matches.</li>}
            {shown.map((o, i) => {
              const n = note?.(o) ?? null;
              return (
                <li key={o.code || "whole"} role="option" aria-selected={o.code === value}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs ${i === active ? "bg-[#2e9bf5]/22" : ""} ${o.code === value ? "text-white" : "text-[#cfe9ff]"}`}
                  >
                    <span className="w-9 shrink-0 font-mono font-semibold text-[#9be0ff]">{o.code || "—"}</span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {n && <span className="shrink-0 rounded-full border border-[#63b4f8]/30 px-1.5 text-[10px] text-[#9aa4b2]">{n}</span>}
                    {o.code === value && <span aria-hidden="true" className="text-[#9be0ff]">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
