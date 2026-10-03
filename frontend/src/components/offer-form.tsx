"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  athleteItemsAction, createOfferAction, offerChecksAction, searchOfferAthletesAction, sendOfferAction, updateOfferAction,
  type ItemOption,
} from "@/app/(app)/admin/offers/actions";
import {
  budgetLine, centsFromUsd, filledNote, firstName, floorLine, marginFloorLine, money, offerBody, otherProblems, partyWords, sendBlocker, sendSummary,
  type ApiOfferChecks, type ApiOfferParty, type CheckLine, type FieldSources, type FilledField, type OfferBody, type OfferFields,
} from "@/lib/admin-offers-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's new-offer form, and a draft's edit — 2S2-FE-03, BTG half (design
   Offers.dc.html, views form, formLow and send). Pickers and checks are live:

     Campaign            GET /campaigns (the page passes them in)
     Athlete             GET /offers/athletes?q=   (searchOfferAthletesAction)
     NIL job             GET /catalogue/jobs       (the page passes them in)
     From inventory      GET /inventory, the athlete's own active items
     Checks              GET /campaigns/:id/offer-checks — the athlete's floor
                         (their rate for the job, or the item's price), the
                         margin floor (sell ≥ pay × 1.4) and the campaign's
                         remaining budget, as the API will ask them on save

   "Save draft" → POST /offers (or PATCH /offers/:id for a draft); "Save and
   send" saves, then POST /offers/:id/send after the confirm. It stays off
   while a check fails. The API asks every rule again either way.
   -------------------------------------------------------------------------- */

export type CampaignOption = { id: string; name: string; sponsorName: string };
export type JobOption = { id: string; name: string };
type Party = ApiOfferParty & { id: string };

const field = "box-border h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-text outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
const area = "box-border w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text outline-none focus:border-primary";
const label = "flex flex-col gap-1.5 text-xs font-medium";
const primaryBtn = "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const quietBtn = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const smallBtn = "min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2";
const FIXED_TIP = "Whose offer it is can't change. Start a new offer instead.";

export function OfferForm({ offerId, initial, campaigns, jobs, athlete: fixedAthlete, sources }: {
  /** Set when editing a draft: the campaign and the athlete are fixed. */
  offerId?: string;
  initial: OfferFields;
  campaigns: CampaignOption[];
  jobs: JobOption[];
  athlete: Party | null;
  /** P4-FE-08 — opened pre-filled from GET /campaigns/:id/offer-draft: where
   *  each field's value came from. Shown under a field while it still holds
   *  that value; BTG can change every one. */
  sources?: FieldSources;
}) {
  const router = useRouter();
  const editing = Boolean(offerId);
  const [f, setF] = useState<OfferFields>(initial);
  const set = <K extends keyof OfferFields>(k: K, v: OfferFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const filled = (k: FilledField) => <Filled text={filledNote(sources, initial, f, k)} />;
  const [savedId, setSavedId] = useState<string | null>(offerId ?? null);

  /* ── the athlete picker ─────────────────────────────────────────────── */
  const [athlete, setAthlete] = useState<Party | null>(fixedAthlete);
  const [query, setQuery] = useState(fixedAthlete?.name ?? "");
  const [results, setResults] = useState<Party[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  useEffect(() => {
    if (editing || (athlete && query === athlete.name)) return;
    const term = query.trim();
    if (!term) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchOfferAthletesAction(term);
      if (!live) return; // typed on, or picked, since
      if (r.ok) {
        setResults(r.athletes);
        setSearchError(null);
      } else setSearchError(r.message);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, athlete, editing]);
  const pick = (a: Party) => {
    setAthlete(a);
    setQuery(a.name);
    setResults(null);
    setF((x) => ({ ...x, athleteId: a.id, inventoryItemId: "" }));
  };

  /* ── the athlete's inventory ───────────────────────────────────────── */
  const [items, setItems] = useState<ItemOption[]>([]);
  useEffect(() => {
    let live = true;
    if (!f.athleteId) {
      queueMicrotask(() => live && setItems([]));
      return () => { live = false; };
    }
    athleteItemsAction(f.athleteId).then((r) => { if (live) setItems(r.ok ? r.items : []); });
    return () => { live = false; };
  }, [f.athleteId]);

  /* ── the live checks ───────────────────────────────────────────────── */
  const pay = centsFromUsd(f.pay);
  const sell = centsFromUsd(f.sell);
  const [checks, setChecks] = useState<ApiOfferChecks | null>(null);
  const [checksError, setChecksError] = useState<string | null>(null);
  const asked = useRef(0);
  useEffect(() => {
    if (!f.campaignId) return;
    const n = ++asked.current;
    const t = setTimeout(async () => {
      const r = await offerChecksAction(f.campaignId, {
        athleteId: f.athleteId || null, jobId: f.jobId || null, inventoryItemId: f.inventoryItemId || null, compensation: pay, sellPrice: sell,
      });
      if (n !== asked.current) return;
      if (r.ok) {
        setChecks(r.checks);
        setChecksError(null);
      } else setChecksError(r.message);
    }, 300);
    return () => clearTimeout(t);
  }, [f.campaignId, f.athleteId, f.jobId, f.inventoryItemId, pay, sell]);
  const shown = f.campaignId ? checks : null;
  const ready = Boolean(f.campaignId && f.athleteId && f.jobId);
  const floor: CheckLine = ready
    ? floorLine(shown, athlete?.name ?? null, pay)
    : { text: "Pick a campaign, an athlete and a NIL job to check the pay against their floor.", tone: "muted" };
  const marginFloor = marginFloorLine(shown);
  const budget = budgetLine(shown);
  const blocker = sendBlocker(shown);
  const margin = pay !== null && sell !== null ? money(sell - pay) : "—";

  /* ── saving ─────────────────────────────────────────────────────────── */
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<OfferBody | null>(null);

  const save = async (body: OfferBody) => (savedId ? updateOfferAction(savedId, body) : createOfferAction(body));
  const saveDraft = () => {
    setError(null);
    const b = offerBody(f);
    if (!b.ok) return setError(b.message);
    start(async () => {
      const r = await save(b.body);
      if (!r.ok) return setError(r.message);
      router.push(`/admin/offers/${r.id}`);
    });
  };
  const askSend = () => {
    setError(null);
    const b = offerBody(f);
    if (!b.ok) return setError(b.message);
    setConfirm(b.body);
  };

  const first = athlete ? firstName(athlete.name) : "the athlete";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
      <form aria-label={editing ? "Edit the draft" : "New offer"} className="flex min-w-0 flex-col gap-3.5 rounded-xl border border-line bg-surface p-4 sm:px-5"
        onSubmit={(e) => { e.preventDefault(); saveDraft(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Campaign
            <select className={field} value={f.campaignId} disabled={editing} title={editing ? FIXED_TIP : undefined}
              onChange={(e) => { setChecks(null); set("campaignId", e.target.value); }}>
              <option value="">Choose a campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.sponsorName} · {c.name}</option>)}
            </select>
          </label>
          <div className="relative flex flex-col gap-1.5 text-xs font-medium">
            <label htmlFor="of-athlete">Athlete</label>
            <input id="of-athlete" type="search" className={field} value={query} disabled={editing} title={editing ? FIXED_TIP : undefined}
              autoComplete="off" placeholder="Search by name" aria-describedby={athlete ? "of-athlete-who" : undefined}
              onKeyDown={(e) => { if (e.key === "Escape") setResults(null); }}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                if (!v.trim()) setResults(null);
                if (athlete && v !== athlete.name) {
                  setAthlete(null);
                  setF((x) => ({ ...x, athleteId: "", inventoryItemId: "" }));
                }
              }} />
            {athlete && <span id="of-athlete-who" className="text-[11px] font-normal text-muted">{partyWords(athlete)}{athlete.guardianName ? ` — ${athlete.guardianName}` : ""}</span>}
            {searchError && <span role="alert" className="text-[11px] font-normal text-danger">{searchError}</span>}
            {results && (
              <ul aria-label="Matching athletes" className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-xl">
                {results.length === 0 ? (
                  <li className="px-3 py-2 text-xs font-normal text-muted">No active athlete matches “{query.trim()}”.</li>
                ) : results.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => pick(a)} className="flex min-h-11 w-full flex-col items-start justify-center rounded-md px-3 py-1.5 text-left hover:bg-surface-2">
                      <span className="text-[13px] font-semibold">{a.name}</span>
                      <span className="text-[11px] font-normal text-muted">{partyWords(a)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className={label}>
            NIL job
            <select className={field} value={f.jobId} onChange={(e) => set("jobId", e.target.value)}>
              <option value="">Choose a job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className={label}>
            <span>From the athlete&rsquo;s inventory <span className="font-normal text-muted">(optional)</span></span>
            <select className={field} value={f.inventoryItemId} disabled={!f.athleteId}
              title={!f.athleteId ? "Pick the athlete first." : undefined}
              onChange={(e) => {
                const id = e.target.value;
                const it = items.find((i) => i.id === id);
                setF((x) => ({ ...x, inventoryItemId: id, jobId: x.jobId || it?.jobId || "" }));
              }}>
              <option value="">None</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.title} · {money(i.priceCents)}</option>)}
            </select>
          </label>
        </div>

        <label className={label}>
          Brief
          <textarea rows={2} className={area} maxLength={8000} value={f.brief} onChange={(e) => set("brief", e.target.value)} />
          {filled("brief")}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Athlete&rsquo;s pay ($)
            <input type="text" inputMode="decimal" className={`${field} ${floor.tone === "danger" ? "border-danger" : ""}`} value={f.pay}
              aria-describedby="floor-chk" aria-invalid={floor.tone === "danger" || undefined} onChange={(e) => set("pay", e.target.value)} />
            {filled("pay")}
          </label>
          <label className={label}>
            Sell price ($)
            <input type="text" inputMode="decimal" className={`${field} ${marginFloor ? "border-danger" : ""}`} value={f.sell}
              aria-describedby={marginFloor ? "margin-chk" : undefined} aria-invalid={marginFloor ? true : undefined} onChange={(e) => set("sell", e.target.value)} />
            {filled("sell")}
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">Deliverables</legend>
          {f.deliverables.map((d, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <input type="text" aria-label={`Deliverable ${i + 1}`} className={field} maxLength={200} value={d.title}
                onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input type="date" aria-label={`Due date ${i + 1}`} className={field} value={d.due}
                onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} />
              {f.deliverables.length > 1 && (
                <button type="button" className={smallBtn} aria-label={`Remove deliverable ${i + 1}`}
                  onClick={() => set("deliverables", f.deliverables.filter((_, j) => j !== i))}>Remove</button>
              )}
            </div>
          ))}
          {f.deliverables.length < 20 && (
            <button type="button" className={`${smallBtn} self-start`} onClick={() => set("deliverables", [...f.deliverables, { title: "", due: "" }])}>
              Add a deliverable
            </button>
          )}
          {filled("deliverables")}
        </fieldset>

        <label className={label}>
          Usage rights
          <textarea rows={2} className={area} maxLength={2000} value={f.usageRights} onChange={(e) => set("usageRights", e.target.value)} />
          {filled("usageRights")}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span>Exclusivity days <span className="font-normal text-muted">(optional)</span></span>
            <input type="number" min={0} max={730} className={field} value={f.exclusivityDays} onChange={(e) => set("exclusivityDays", e.target.value)} />
            {filled("exclusivityDays")}
          </label>
          <label className={label}>
            Expires
            <input type="date" className={field} value={f.expires} onChange={(e) => set("expires", e.target.value)} />
            {filled("expires")}
          </label>
        </div>

        <Disclosures value={f.disclosures} onChange={(v) => set("disclosures", v)} />
        {filled("disclosures")}
        {/* Enter in a field saves a draft — never sends. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>

      <aside aria-label="Checks" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Checks</h2>
        <Check id="floor-chk" line={floor} />
        {marginFloor && <Check id="margin-chk" line={marginFloor} />}
        <Check line={budget} />
        {otherProblems(shown).map((p) => <Check key={p} line={{ text: `✕ ${p}`, tone: "danger" }} />)}
        {checksError && <p role="alert" className="text-[11px] text-danger">{checksError} Saving still runs every check.</p>}
        <p className="text-xs text-muted">BTG&rsquo;s margin: <span className="tabular-nums">{margin}</span></p>
        <button type="button" className={primaryBtn} disabled={pending || Boolean(blocker)} onClick={askSend}>Save and send</button>
        {blocker && <p className="text-[11px] text-danger">{blocker}</p>}
        <button type="button" className={quietBtn} disabled={pending} onClick={saveDraft}>{pending && !confirm ? "Saving…" : "Save draft"}</button>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      </aside>

      {confirm && (
        <SendDialog first={first} guardian={athlete?.guardianAnswers ? athlete.guardianName : null} body={confirm}
          onClose={() => setConfirm(null)}
          run={async () => {
            const saved = await save(confirm);
            if (!saved.ok) return saved.message;
            setSavedId(saved.id);
            const sent = await sendOfferAction(saved.id);
            if (!sent.ok) return `The draft is saved, but it wasn't sent: ${sent.message}`;
            router.push(`/admin/offers/${saved.id}`);
            return null;
          }} />
      )}
    </div>
  );
}

/** P4-FE-08 — where a pre-filled field's value came from. */
function Filled({ text }: { text: string | null }) {
  return text ? <span className="text-[11px] font-normal leading-snug text-muted">{text}</span> : null;
}

function Check({ id, line }: { id?: string; line: CheckLine }) {
  const tone = line.tone === "ok" ? "border-success/40 text-success" : line.tone === "danger" ? "border-danger/50 text-danger" : "border-line text-muted";
  return <p id={id} role="status" className={`rounded-lg border bg-bg px-3 py-2.5 text-[13px] font-semibold ${tone}`}>{line.text}</p>;
}

function Disclosures({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().slice(0, 100);
    if (t && !value.includes(t) && value.length < 10) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium" id="of-disclosures">Disclosures</span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="of-disclosures">
        {value.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded-full border border-primary-soft bg-primary/12 py-1 pl-2.5 pr-1 text-xs">
            {d}
            <button type="button" aria-label={`Remove ${d}`} onClick={() => onChange(value.filter((x) => x !== d))}
              className="grid size-6 place-items-center rounded-full text-muted hover:text-text">×</button>
          </span>
        ))}
        <input type="text" aria-label="New disclosure" placeholder="e.g. #sponsored" maxLength={100} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-9 w-36 rounded-lg border border-line bg-bg px-2.5 text-xs outline-none focus:border-primary" />
        <button type="button" className={smallBtn} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function SendDialog({ first, guardian, body, onClose, run }: {
  first: string; guardian: string | null; body: OfferBody; onClose: () => void; run: () => Promise<string | null>;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => { setError(null); const e = await run(); if (e) setError(e); });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sd-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <section className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="sd-title" className="text-lg font-semibold">Send this offer to {first}?</h2>
          <p className="text-sm leading-relaxed">
            Once sent, these terms are fixed. {guardian ? `${guardian} is emailed to answer for ${first}, and` : `${first} is emailed and`} can accept, decline or ask for a change.
          </p>
          <p className="text-xs leading-normal text-muted">{sendSummary(body)}</p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className={quietBtn}>Cancel</button>
            <button type="button" onClick={go} disabled={pending} className={primaryBtn}>{pending ? "Sending…" : `Send to ${first}`}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
