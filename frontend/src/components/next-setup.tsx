"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelEditionAction, createEditionAction, createPublicationAction, updateEditionAction } from "@/app/(app)/admin/next/actions";
import { CANCELLABLE_STATES, EDITABLE_STATES, editionFormProblem, isoDay, type ApiPublications, type EditionForm } from "@/lib/next-setup-live";

/* --------------------------------------------------------------------------
   POL-FE-56 (app review B5) — "Set up" on BTG's Editions page: New
   publication, New edition, Edit this edition (while planning or selling)
   and Cancel this edition. Each form checks itself, then the API decides.
   -------------------------------------------------------------------------- */

const field = "w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs text-text focus:border-next focus:outline-none";
const submit = "inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-40";
const quiet = "inline-flex min-h-9 items-center rounded-lg border border-line px-3.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";

type Note = { ok: boolean; text: string } | null;
function Line({ n }: { n: Note }) {
  return n ? <p role={n.ok ? "status" : "alert"} className={n.ok ? "text-[11px] text-accent" : "text-[11px] text-danger"}>{n.text}</p> : null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Note>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote({ ok: r.ok, text: r.message });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, note, setNote, run };
}

function EditionFields({ f, set }: { f: EditionForm; set: (k: keyof EditionForm, v: string) => void }) {
  return (
    <>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Edition name</span>
        <input className={field} value={f.label} maxLength={100} onChange={(e) => set("label", e.target.value)} placeholder="Spring 2027" />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Threshold (USD) — the least it must sell to print</span>
        <input className={field} inputMode="decimal" value={f.threshold} onChange={(e) => set("threshold", e.target.value)} placeholder="3000" />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Sales open (optional — empty: open by hand)</span>
        <input type="date" className={field} value={f.salesOpenAt ?? ""} onChange={(e) => set("salesOpenAt", e.target.value)} />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Sales close</span>
        <input type="date" className={field} value={f.closeDate} onChange={(e) => set("closeDate", e.target.value)} />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Publishes</span>
        <input type="date" className={field} value={f.publishTarget} onChange={(e) => set("publishTarget", e.target.value)} />
      </label>
    </>
  );
}

export function NewPublicationForm({ schools }: { schools: ApiPublications["schools"] }) {
  const { pending, note, setNote, run } = useRun();
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  return (
    <form aria-label="New publication" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return setNote({ ok: false, text: "Name the publication." });
      run(() => createPublicationAction(name, school || null), () => setName(""));
    }}>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Publication name</span>
        <input className={field} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="The Northside Record" />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>School</span>
        <select className={field} value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">No school — the regional edition</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={submit}>Create publication</button>
        <Line n={note} />
      </div>
    </form>
  );
}

export function NewEditionForm({ publications }: { publications: ApiPublications["publications"] }) {
  const { pending, note, setNote, run } = useRun();
  const blank: EditionForm = { label: "", closeDate: "", publishTarget: "", threshold: "", salesOpenAt: "" };
  const [pub, setPub] = useState(publications[0]?.id ?? "");
  const [f, setF] = useState<EditionForm>(blank);
  if (!publications.length) return <p className="text-xs text-muted">Create a publication first — an edition belongs to one.</p>;
  return (
    <form aria-label="New edition" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const p = editionFormProblem(f);
      if (p) return setNote({ ok: false, text: p });
      run(() => createEditionAction(pub, f), () => setF(blank));
    }}>
      <label className="space-y-1 text-[11px] font-medium text-muted sm:col-span-2">
        <span>Publication</span>
        <select className={field} value={pub} onChange={(e) => setPub(e.target.value)}>
          {publications.map((p) => <option key={p.id} value={p.id}>{p.name}{p.schoolName ? ` · ${p.schoolName}` : " · regional"}</option>)}
        </select>
      </label>
      <EditionFields f={f} set={(k, v) => setF((x) => ({ ...x, [k]: v }))} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={submit}>Create edition</button>
        <Line n={note} />
      </div>
    </form>
  );
}

export type CurrentEdition = { id: string; label: string; state: string; closeDate: string; publishTarget: string; thresholdCents: number; salesOpenAt?: string | null };

export function EditEditionForm({ edition }: { edition: CurrentEdition }) {
  const { pending, note, setNote, run } = useRun();
  const [f, setF] = useState<EditionForm>({
    label: edition.label, closeDate: isoDay(edition.closeDate), publishTarget: isoDay(edition.publishTarget),
    threshold: String(edition.thresholdCents / 100), salesOpenAt: isoDay(edition.salesOpenAt),
  });
  if (!EDITABLE_STATES.includes(edition.state)) {
    return <p className="text-xs text-muted">{edition.label} is past selling — its dates and threshold are fixed now.</p>;
  }
  return (
    <form aria-label="Edit this edition" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const p = editionFormProblem(f);
      if (p) return setNote({ ok: false, text: p });
      run(() => updateEditionAction(edition.id, f));
    }}>
      <EditionFields f={f} set={(k, v) => setF((x) => ({ ...x, [k]: v }))} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={submit}>Save changes</button>
        <Line n={note} />
      </div>
    </form>
  );
}

export function CancelEditionButton({ edition }: { edition: CurrentEdition }) {
  const { pending, note, run } = useRun();
  const [sure, setSure] = useState(false);
  if (!CANCELLABLE_STATES.includes(edition.state)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!sure ? (
        <button type="button" className={quiet} onClick={() => setSure(true)}>Cancel this edition…</button>
      ) : (
        <>
          <span className="text-xs text-text">Cancel {edition.label}? Sold slots are released and a refund is recorded for each sponsor who bought one. This can&apos;t be undone.</span>
          <button type="button" disabled={pending} className="inline-flex min-h-9 items-center rounded-lg border border-danger/50 px-3.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-40" onClick={() => run(() => cancelEditionAction(edition.id))}>
            Yes, cancel it
          </button>
          <button type="button" className={quiet} onClick={() => setSure(false)}>Keep it</button>
        </>
      )}
      <Line n={note} />
    </div>
  );
}
