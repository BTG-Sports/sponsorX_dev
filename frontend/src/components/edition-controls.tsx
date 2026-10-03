"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import {
  addAssetAction,
  grantRightAction,
  setContentReadyAction,
  setRateCardAction,
  setSalesOpenAction,
  splitLockAction,
  transitionEditionAction,
  type GrantInput,
} from "@/app/(app)/admin/next/actions";
import { rateCardPrice, type ApiEditionState, type ApiRateCard, type ApiSlotKind } from "@/lib/editions-live";
import {
  CONSENT_GRANTORS,
  NEXT_STATE,
  STATE_VERB,
  type AssetKind,
  type GrantorKind,
  type SourceKind,
} from "@/lib/rights-live";

/* --------------------------------------------------------------------------
   P9-FE-03 / -09 — the edition's own writes: move it on, mark content
   ready, add an asset, record a right. Each is a server action over the
   API; the state machine, the production gate and the rights rules decide
   and their refusals are shown verbatim ("No digital right covers: …").
   -------------------------------------------------------------------------- */

type Note = { ok: boolean; message: string } | null;

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p role="status" className={`text-[11px] ${note.ok ? "text-success" : "text-danger"}`}>
      {note.message}
    </p>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Note>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => {
    setNote(null);
    start(async () => {
      const r = await fn();
      setNote(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, note, run };
}

export function EditionAdvance({ editionId, state }: { editionId: string; state: ApiEditionState }) {
  const { pending, note, run } = useAction();
  const to = NEXT_STATE[state];
  if (!to) return null;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={() => run(() => transitionEditionAction(editionId, to))} disabled={pending}>
        {pending ? "Working…" : STATE_VERB[to]}
      </Button>
      <NoteLine note={note} />
    </div>
  );
}

export function ContentReadyToggle({ editionId, ready }: { editionId: string; ready: boolean }) {
  const { pending, note, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setContentReadyAction(editionId, !ready))}
        className="text-[11px] font-medium text-next transition-colors hover:text-next-soft disabled:opacity-40"
      >
        {ready ? "Mark not ready" : "Mark content ready"}
      </button>
      <NoteLine note={note} />
    </div>
  );
}

const field =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-admin";
const label = "flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted";

const ASSET_KINDS: Array<[AssetKind, string]> = [
  ["ARTICLE", "Article"], ["PHOTO", "Photo"], ["PHOTO_PACKAGE", "Photo package"],
  ["INTERVIEW", "Interview"], ["VIDEO", "Video"], ["AD_CREATIVE", "Ad creative"],
];
const SOURCES: Array<[SourceKind, string]> = [
  ["STUDENT", "Student"], ["ATHLETE", "Athlete"], ["BTG", "SponsorX"], ["THIRD_PARTY", "Third party"],
];

export function AddAsset({ editionId }: { editionId: string }) {
  const { pending, note, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AssetKind>("ARTICLE");
  const [source, setSource] = useState<SourceKind>("BTG");
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Add an asset</Button>;
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAssetAction(editionId, { title, kind, sourceKind: source }), () => setTitle(""));
      }}
    >
      <label className={`${label} min-w-0 flex-1 basis-48`}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required className={`${field} normal-case`} />
      </label>
      <label className={label}>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)} className={`${field} normal-case`}>
          {ASSET_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className={label}>
        Source
        <select value={source} onChange={(e) => setSource(e.target.value as SourceKind)} className={`${field} normal-case`}>
          {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">Done</button>
      <div className="basis-full"><NoteLine note={note} /></div>
    </form>
  );
}

const GRANTORS: Array<[GrantorKind, string]> = [
  ["STUDENT", "Student"], ["ATHLETE", "Athlete"], ["GUARDIAN", "Guardian"], ["BTG", "SponsorX"], ["THIRD_PARTY", "Third party"],
];
const PERMS: Array<[keyof Pick<GrantInput, "mayPublishDigital" | "mayPublishPrint" | "mayPromote" | "mayReuseCommercially">, string]> = [
  ["mayPublishDigital", "Digital"], ["mayPublishPrint", "Print"], ["mayPromote", "Promote"], ["mayReuseCommercially", "Commercial reuse"],
];

/** Record a right on one asset. `today` is the server's date (yyyy-mm-dd). */
export function GrantRight({ assetId, source, today }: { assetId: string; source: SourceKind; today: string }) {
  const { pending, note, run } = useAction();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState<GrantInput>({
    grantorKind: source === "THIRD_PARTY" ? "THIRD_PARTY" : source === "BTG" ? "BTG" : source,
    grantorRef: "",
    evidence: "",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: false,
    mayReuseCommercially: false,
    startsOn: today,
    endsOn: "",
  });
  if (!open) return <Button onClick={() => setOpen(true)}>Record a right</Button>;
  const consent = CONSENT_GRANTORS.includes(g.grantorKind);
  const set = <K extends keyof GrantInput>(k: K, v: GrantInput[K]) => setG((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="mt-2 flex w-full basis-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => grantRightAction(assetId, g), () => setOpen(false));
      }}
    >
      <label className={label}>
        Grantor
        <select value={g.grantorKind} onChange={(e) => set("grantorKind", e.target.value as GrantorKind)} className={`${field} normal-case`}>
          {GRANTORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className={`${label} min-w-0 flex-1 basis-40`}>
        Who
        <input value={g.grantorRef} onChange={(e) => set("grantorRef", e.target.value)} maxLength={200} required className={`${field} normal-case`} />
      </label>
      <label className={`${label} min-w-0 flex-1 basis-40`}>
        {consent ? "Signed acceptance id" : "Licence reference"}
        <input value={g.evidence} onChange={(e) => set("evidence", e.target.value)} maxLength={200} required className={`${field} normal-case`} />
      </label>
      <label className={label}>
        From
        <input type="date" value={g.startsOn} onChange={(e) => set("startsOn", e.target.value)} required className={field} />
      </label>
      <label className={label}>
        Until
        <input type="date" value={g.endsOn} onChange={(e) => set("endsOn", e.target.value)} className={field} />
      </label>
      <fieldset className="flex basis-full flex-wrap gap-3 text-xs">
        <legend className="sr-only">Permissions</legend>
        {PERMS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={g[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Recording…" : "Record"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">Cancel</button>
      <div className="basis-full"><NoteLine note={note} /></div>
    </form>
  );
}

/* --------------------------------------------------------------------------
   P9-FE-11 — editions that run themselves (P9-BE-17 / -18 / -19): the day
   sales open by themselves, the masthead's rate card, and Finance's split
   lock. Each is a server action; the API decides and its refusals are shown.
   -------------------------------------------------------------------------- */

/** BTG sets (or clears) the day sales open by themselves — while PLANNING. */
export function SalesOpenDate({ editionId, salesOpenAt }: { editionId: string; salesOpenAt: string | null }) {
  const { pending, note, run } = useAction();
  const [day, setDay] = useState(salesOpenAt ? salesOpenAt.slice(0, 10) : "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setSalesOpenAction(editionId, day));
      }}
    >
      <label className={label}>
        Sales open on
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={field} />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-next/50 disabled:opacity-40">
        {pending ? "Saving…" : day ? "Save date" : "Open by hand"}
      </button>
      <div className="basis-full"><NoteLine note={note} /></div>
    </form>
  );
}

const CARD_KINDS: Array<[ApiSlotKind, string]> = [
  ["FULL", "Full page"], ["HALF", "Half page"], ["QUARTER", "Quarter"], ["BACK_COVER", "Back cover"], ["PRESENTING", "Presenting"],
];

/** BTG admin keeps the masthead's rate card: a price per kind, empty for none. */
export function RateCardEditor({ publicationId, card }: { publicationId: string; card: ApiRateCard | null }) {
  const { pending, note, run } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () =>
    Object.fromEntries(CARD_KINDS.map(([k]) => {
      const p = rateCardPrice(card, k);
      return [k, p == null ? "" : String(p / 100)];
    })) as Record<ApiSlotKind, string>;
  const [dollars, setDollars] = useState<Record<ApiSlotKind, string>>(initial);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Rate card</Button>;
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setRateCardAction(publicationId, dollars));
      }}
    >
      {CARD_KINDS.map(([k, l]) => (
        <label key={k} className={label}>
          {l} $
          <input
            value={dollars[k]}
            onChange={(e) => setDollars((d) => ({ ...d, [k]: e.target.value }))}
            inputMode="decimal"
            placeholder="none"
            className={`${field} w-20 tabular-nums normal-case`}
          />
        </label>
      ))}
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">Done</button>
      <p className="basis-full text-[11px] text-muted">A slot added without a price takes the card&rsquo;s; a different typed price is refused. Slots already added keep their price.</p>
      <div className="basis-full"><NoteLine note={note} /></div>
    </form>
  );
}

/** Finance locks the split with a note; BTG admin unlocks it with a reason. */
export function SplitLockControl({ editionId, locked, canLock, canUnlock }: { editionId: string; locked: boolean; canLock: boolean; canUnlock: boolean }) {
  const { pending, note, run } = useAction();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const lock = !locked;
  if ((lock && !canLock) || (!lock && !canUnlock)) return null;
  if (!open) {
    return (
      <Button variant={lock ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {lock ? "Lock split" : "Unlock split"}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => splitLockAction(editionId, lock, text), () => { setText(""); setOpen(false); });
      }}
    >
      <label className={`${label} min-w-0 flex-1 basis-56`}>
        {lock ? "What you checked" : "Why it is being unlocked"}
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} required className={`${field} normal-case`} />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Saving…" : lock ? "Lock" : "Unlock"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">Cancel</button>
      <p className="basis-full text-[11px] text-muted">
        {lock
          ? "Locked, the split is never recomputed, and any payout from it will need the lock."
          : "Unlocked, the split can be recomputed again. Finance locks it again once checked."}
      </p>
      <div className="basis-full"><NoteLine note={note} /></div>
    </form>
  );
}
