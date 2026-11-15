"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { approveAssignmentAction, createAssignmentAction, reviseAssignmentAction } from "@/app/(app)/advisor/review/actions";
import { draftFileAction } from "@/app/(app)/next/assignments/actions";
import { assignProblem, KIND_WORDS, revisionProblem } from "@/lib/student-assignments-live";
import { Button } from "./ui";

/* --------------------------------------------------------------------------
   P9-FE-12 — the advisor's content review: the decision on one piece
   (approve, or send back with a note the student reads word for word), the
   draft's file, and the "Assign a piece" form. The page around them is
   server-rendered (advisor/review/page.tsx).
   -------------------------------------------------------------------------- */

const field = "w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs text-text placeholder:text-faint focus:border-next focus:outline-none";
const submitCls = "sx-btn-primary inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

function Message({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={m.ok ? "text-[11px] text-accent" : "text-[11px] text-danger"}>{m.text}</p>;
}

/** Opens the draft's file on a short-lived signed link. */
export function DraftFileButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="secondary"
        onClick={async () => {
          const r = await draftFileAction(id);
          if (r.ok) window.open(r.url, "_blank", "noopener");
          else setError(r.message);
        }}
      >
        Open the file
      </Button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** Approve, or send back with a reason. */
export function ReviewDecision({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    setMessage(null);
    const r = await fn();
    setBusy(false);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  };

  return (
    <section aria-label={`Decision on ${title}`} className="space-y-3">
      <button type="button" className={submitCls} disabled={busy} onClick={() => run(() => approveAssignmentAction(id))}>
        Approve — add it to the edition
      </button>
      <form
        className="space-y-2"
        aria-label="Send it back"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = revisionProblem(note);
          if (problem) {
            setMessage({ ok: false, text: problem });
            return;
          }
          void run(() => reviseAssignmentAction(id, note));
        }}
      >
        <label htmlFor={`note-${id}`} className="block text-[11px] font-medium text-muted">Or send it back — what should the student change?</label>
        <textarea id={`note-${id}`} rows={3} maxLength={2000} className={field} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="The student reads these words exactly." />
        <button type="submit" disabled={busy} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40">
          Send back to the student
        </button>
      </form>
      <Message m={message} />
    </section>
  );
}

export type AssignOption = { id: string; label: string };

/** "Assign a piece": pick the edition and the student, what they make, the brief. */
export function AssignForm({ editions, students }: { editions: AssignOption[]; students: AssignOption[] }) {
  const router = useRouter();
  const [f, setF] = useState({ editionId: editions[0]?.id ?? "", studentId: "", kind: "ARTICLE", title: "", section: "", brief: "", dueAt: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (!editions.length || !students.length) {
    return (
      <p className="text-xs text-muted">
        {!editions.length ? "No edition is taking content right now — content is assigned before an edition goes to production." : "No active students yet — approve an application on the Applications tab first."}
      </p>
    );
  }

  return (
    <form
      aria-label="Assign a piece"
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = assignProblem(f);
        if (problem) {
          setMessage({ ok: false, text: problem });
          return;
        }
        setBusy(true);
        setMessage(null);
        const r = await createAssignmentAction(f);
        setBusy(false);
        setMessage({ ok: r.ok, text: r.message });
        if (r.ok) {
          setF((x) => ({ ...x, title: "", section: "", brief: "", dueAt: "" }));
          router.refresh();
        }
      }}
    >
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Edition</span>
        <select className={field} value={f.editionId} onChange={set("editionId")}>
          {editions.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Student</span>
        <select className={field} value={f.studentId} onChange={set("studentId")}>
          <option value="">Pick a student</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>What they make</span>
        <select className={field} value={f.kind} onChange={set("kind")}>
          {Object.entries(KIND_WORDS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Due (optional)</span>
        <input type="date" className={field} value={f.dueAt} onChange={set("dueAt")} />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Title</span>
        <input className={field} maxLength={200} value={f.title} onChange={set("title")} placeholder="Northside's comeback season" />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted">
        <span>Section (optional)</span>
        <input className={field} maxLength={80} value={f.section} onChange={set("section")} placeholder="Sports" />
      </label>
      <label className="space-y-1 text-[11px] font-medium text-muted sm:col-span-2">
        <span>Brief</span>
        <textarea className={field} rows={3} maxLength={4000} value={f.brief} onChange={set("brief")}
          placeholder="What you want, how long, and anything they must include." />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={submitCls}>{busy ? "Assigning…" : "Assign"}</button>
        <Message m={message} />
      </div>
    </form>
  );
}
