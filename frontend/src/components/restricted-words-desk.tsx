"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui";
import {
  TEST_LINES_MAX, testWhy, WHERE_CHECKED, type ApiRestrictedKind, type ApiRestrictedTest, type ApiRestrictedWord, type WordGroup, type WordWriteFailure,
} from "@/lib/restricted-words-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The restricted-words desk — 2S1-FE-11 (design RestrictedWords.dc.html,
   list / add / test). One island because "Add word", each word's remove and
   add-back, and the test box all write through server actions and refresh
   the same list. Every outcome shown is the API's answer — a word is only
   shown removed once the API has taken it off.
   -------------------------------------------------------------------------- */

type Result<T = object> = Promise<({ ok: true } & T) | WordWriteFailure>;
type Actions = {
  add: (input: { word: string; kind: string }) => Result;
  remove: (id: string) => Result;
  test: (text: string) => Result<{ results: { input: string; result: ApiRestrictedTest }[] }>;
};

const pill = "inline-flex items-center gap-1.5 rounded-full border bg-bg text-xs";

export function RestrictedWordsDesk({ groups, kinds, activeWords, history, actions }: {
  groups: WordGroup[];
  kinds: ApiRestrictedKind[];
  activeWords: string[];
  history: ReactNode;
  actions: Actions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (w: ApiRestrictedWord, run: () => Result) => {
    setBusyId(w.id);
    setError(null);
    try {
      const r = await run();
      if (!r.ok) setError(r.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-xl font-semibold tracking-tight">Restricted words</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Text that uses one of these is held for BTG&rsquo;s review instead of being approved by itself — a match never rejects anything.
            {" "}{WHERE_CHECKED}
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
          Add word
        </button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Restricted words by kind" className="overflow-hidden rounded-xl border border-line bg-surface">
            {error && <p role="alert" className="m-4 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
            {groups.map((g) => (
              <div key={g.kind} className="border-t border-line-soft px-4 py-3.5 first:border-t-0">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{g.label}</h2>
                  <span className="text-[11px] text-muted">{g.count}</span>
                </div>
                {g.active.length + g.removed.length === 0 ? (
                  <p className="mt-2 text-[11px] text-faint">No words of this kind yet.</p>
                ) : (
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {g.active.map((w) => (
                      <li key={w.id} className={`${pill} border-line py-1 pl-3 pr-1`}>
                        {w.word}
                        <button type="button" aria-label={`Remove ${w.word}`} disabled={busyId !== null}
                          onClick={() => change(w, () => actions.remove(w.id))}
                          className="grid size-[26px] place-items-center rounded-full bg-surface-2 text-xs text-muted hover:text-text disabled:opacity-40">
                          {busyId === w.id ? "…" : "✕"}
                        </button>
                      </li>
                    ))}
                    {g.removed.map((w) => (
                      <li key={w.id} className={`${pill} border-dashed border-line py-1 pl-3 pr-1 text-faint`}>
                        <span className="line-through">{w.word}</span>
                        <span className="sr-only">(removed)</span>
                        <button type="button" aria-label={`Add ${w.word} back`} disabled={busyId !== null}
                          onClick={() => change(w, () => actions.add({ word: w.word, kind: w.kind }))}
                          className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-text disabled:opacity-40">
                          {busyId === w.id ? "Adding…" : "Add back"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="border-t border-line-soft px-4 pb-3.5 pt-2.5 text-[11px] text-faint">
              Words match as whole words, with common look-alike spellings (3 for e, 0 for o, @ for a) and letters spaced apart. Letters inside a longer word don&rsquo;t count. A removed word stays here, struck through, so it can be added back.
            </p>
          </section>
          {history}
        </div>

        <TestBox activeWords={activeWords} test={actions.test} />
      </div>

      {adding && <AddWord kinds={kinds} add={actions.add} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); router.refresh(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------- test box */

function TestBox({ activeWords, test }: { activeWords: string[]; test: Actions["test"] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ input: string; result: ApiRestrictedTest }[]>([]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await test(text);
      if (!r.ok) {
        setError(r.message);
        setResults([]);
      } else setResults(r.results);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Test text" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Test text</h2>
      <label htmlFor="rw-test" className="text-xs leading-relaxed text-muted">
        Paste a business description, name or bio to see what would match. Each line is checked on its own (up to {TEST_LINES_MAX}).
      </label>
      <textarea id="rw-test" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
      <button type="button" disabled={busy || !text.trim()} onClick={run}
        className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? "Testing…" : "Test"}
      </button>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      {results.length > 0 && (
        <div role="status" className="space-y-2">
          {results.map(({ input, result }, i) => (
            <div key={i} className={`rounded-lg border bg-bg px-3 py-2.5 ${result.restricted ? "border-danger/45" : "border-accent/40"}`}>
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <strong className="break-all font-semibold">&ldquo;{input}&rdquo;</strong>
                <Badge tone={result.restricted ? "danger" : "accent"}>
                  <span aria-hidden="true" className="mr-1">{result.restricted ? "✕" : "✓"}</span>
                  {result.restricted ? "Matches" : "No match"}
                </Badge>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{testWhy(input, result, activeWords)}</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------ add dialog */

function AddWord({ kinds, add, onClose, onAdded }: { kinds: ApiRestrictedKind[]; add: Actions["add"]; onClose: () => void; onAdded: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [word, setWord] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !word.trim() ? "Write the word or phrase" : !kind ? "Pick its kind" : null;

  const submit = async () => {
    if (missing || !kind) return;
    setBusy(true);
    setError(null);
    try {
      const r = await add({ word: word.trim(), kind });
      if (!r.ok) setError(r.message);
      else onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="aw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="aw-title" className="text-lg font-semibold">Add a restricted word</h2>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Word or phrase
            <input type="text" data-autofocus maxLength={80} value={word} onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              className="h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm font-normal outline-none focus:border-primary" />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-medium">Kind</legend>
            <div className="flex flex-wrap gap-2">
              {kinds.map((k) => {
                const on = kind === k.kind;
                return (
                  <label key={k.kind} className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs ${on ? "border-primary-soft bg-primary/12" : "border-line bg-bg"}`}>
                    <input type="radio" name="rw-kind" checked={on} onChange={() => setKind(k.kind)} className="m-0 accent-[var(--sx-primary)]" />
                    {k.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="text-xs leading-relaxed text-muted">
            It applies to text checked from now on — today, sponsors&rsquo; &ldquo;Other&rdquo; business descriptions. Anything already approved isn&rsquo;t changed. If it was on the list before and removed, this adds it back.
          </p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={busy || Boolean(missing)} onClick={submit} aria-describedby={missing ? "aw-why" : undefined}
              className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Adding…" : "Add word"}
            </button>
          </div>
          {missing && <p id="aw-why" className="text-right text-[11px] text-muted">{missing} to turn on &ldquo;Add word&rdquo;.</p>}
        </div>
      </div>
    </div>
  );
}
