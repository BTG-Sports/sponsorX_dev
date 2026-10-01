"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  listItemAction, moveAthleteListingAction, saveListingDescriptionAction, submitAthleteListingAction, type AthleteListingResult,
} from "@/app/(app)/athlete/listings/actions";
import {
  CHECK_WORD, MAX_DESCRIPTION, descriptionCheck, ownerControls, type ApiAthleteListing, type ListCheck, type TrackStep,
} from "@/lib/athlete-listings-live";

/* --------------------------------------------------------------------------
   2S3-FE-02 — "List my item"'s client islands (ListMyItem.dc.html):

     AthleteListCompose    compose → Submit (creates the draft, submits it)
     AthleteListingEditor  one listing: a draft to finish and submit, or the
                           status track with Pause · Resume · End listing

   The checklist's description row re-runs as the athlete types; every other
   row is the server's (item fields, the API's `blockers`). A refusal is
   shown in the API's words, a 422's problems as a list. After a write the
   page re-reads the listing (router.refresh).
   -------------------------------------------------------------------------- */

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const danger =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

type Failure = { message: string; problems: string[]; draftId?: string };

const STATUS_TONE = {
  ready: { dot: "bg-accent/15 text-accent", pill: "bg-accent/12 text-accent", mark: "✓" },
  fix: { dot: "bg-warn/15 text-warn", pill: "bg-warn/12 text-warn", mark: "!" },
  optional: { dot: "bg-surface-2 text-muted", pill: "bg-surface-2 text-muted", mark: "○" },
} as const;

/** "What BTG checks" — the aside. `children` is the Submit slot. */
export function ListChecklist({ rows, children, foot = "When you submit, BTG checks it and puts it live — or tells you what to change." }: { rows: ListCheck[]; children?: ReactNode; foot?: string }) {
  return (
    <aside aria-label="What BTG checks" className="space-y-2.5 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">What BTG checks</h2>
      <ul>
        {rows.map((r) => {
          const t = STATUS_TONE[r.status];
          return (
            <li key={r.key} className="flex items-start gap-2.5 border-t border-line-soft py-2.5 text-xs">
              <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${t.dot}`}>{t.mark}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{r.label}</span>
                {r.note && <span className="mt-0.5 block text-[11px] text-muted">{r.note}</span>}
                {r.cta && (
                  <Link href={r.cta.href} className="mt-1.5 inline-flex min-h-9 items-center rounded-lg border border-primary/50 px-3 text-[11px] font-semibold text-primary-soft hover:bg-primary/10">
                    {r.cta.label} →
                  </Link>
                )}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-px text-[10px] font-semibold ${t.pill}`}>{CHECK_WORD[r.status]}</span>
            </li>
          );
        })}
      </ul>
      {children}
      <p className="text-[11px] text-faint">{foot}</p>
    </aside>
  );
}

function withDescription(rows: ListCheck[], text: string): ListCheck[] {
  const live = descriptionCheck(text);
  return rows.map((r) => (r.key === "description" ? live : r));
}

function FailureNote({ f }: { f: Failure }) {
  return (
    <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
      <p>{f.problems.length ? "BTG’s rules aren’t met yet:" : f.message}</p>
      {f.problems.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {f.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {f.draftId && (
        <p className="mt-1">
          Your words are saved as a draft —{" "}
          <Link href={`/athlete/listings/${f.draftId}`} className="font-semibold underline">open the draft</Link>.
        </p>
      )}
    </div>
  );
}

function DescriptionField({ value, set, disabled }: { value: string; set: (v: string) => void; disabled: boolean }) {
  return (
    <section aria-label="What the sponsor gets" className="space-y-2 rounded-xl border border-line bg-surface p-5">
      <label htmlFor="li-gets" className="block text-[13px] font-semibold">What the sponsor gets</label>
      <p id="li-hint" className="-mt-1 text-[11px] text-muted">Plain words. Sponsors see this on the marketplace.</p>
      <textarea
        id="li-gets"
        rows={4}
        aria-describedby="li-hint"
        maxLength={MAX_DESCRIPTION}
        disabled={disabled}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder="e.g. A 90-minute youth basketball clinic, with your business named as the sponsor at the session and in my post about it."
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-relaxed text-text placeholder:text-faint focus:border-primary/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </section>
  );
}

/* --------------------------------------------------------------- compose */

export function AthleteListCompose({ itemId, itemTitle, initial, itemCard, checks }: { itemId: string; itemTitle: string; initial: string; itemCard: ReactNode; checks: ListCheck[] }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, start] = useTransition();
  const rows = withDescription(checks, text);

  const submit = () =>
    start(async () => {
      setFailure(null);
      const r = await listItemAction(itemId, itemTitle, text);
      if (r.ok) router.push(`/athlete/listings/${r.listing.id}`);
      else setFailure({ message: r.message, problems: r.problems, draftId: r.draftId });
    });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {itemCard}
        <DescriptionField value={text} set={setText} disabled={pending} />
      </div>
      <ListChecklist rows={rows}>
        <button type="button" className={`${primary} w-full`} disabled={pending} onClick={submit}>
          {pending ? "Submitting…" : "Submit"}
        </button>
        {failure && <FailureNote f={failure} />}
      </ListChecklist>
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

export function AthleteListingEditor({
  listing, itemCard, checks, steps, status,
}: {
  listing: ApiAthleteListing;
  itemCard: ReactNode;
  checks: ListCheck[];
  steps: TrackStep[];
  status: string;
}) {
  const router = useRouter();
  const saved = listing.description ?? "";
  const [text, setText] = useState(saved);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, start] = useTransition();
  /* After a write the page re-reads the listing: follow the saved version
     (adjusting state during render, not in an effect). */
  const [seen, setSeen] = useState(listing.updatedAt);
  if (listing.updatedAt !== seen) {
    setSeen(listing.updatedAt);
    setText(saved);
  }

  const c = ownerControls(listing.state);
  const dirty = c.editable && text.trim() !== saved.trim();
  const rows = c.editable ? withDescription(checks, text) : checks;

  const run = (fn: () => Promise<AthleteListingResult>, done: string) =>
    start(async () => {
      setFailure(null);
      setNotice(null);
      const r = await fn();
      if (r.ok) {
        setNotice(done);
        setConfirmEnd(false);
      } else setFailure({ message: r.message, problems: r.problems });
      router.refresh();
    });

  const end = c.end && (confirmEnd ? (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">End it for good? It can’t be undone.</span>
      <button type="button" className={danger} disabled={pending} onClick={() => run(() => moveAthleteListingAction(listing.id, "ARCHIVED", null), "Ended — it’s off the marketplace.")}>
        End listing
      </button>
      <button type="button" className="text-muted hover:text-text" onClick={() => setConfirmEnd(false)}>Keep it</button>
    </span>
  ) : (
    <button type="button" className={danger} disabled={pending} onClick={() => setConfirmEnd(true)}>End listing</button>
  ));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {itemCard}
        {c.editable && <DescriptionField value={text} set={setText} disabled={pending} />}

        {listing.state !== "DRAFT" && (
          <section aria-label="Listing status" className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">Listing status</h2>
            <ol aria-label="Listing states" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li
                  key={s.label}
                  aria-current={s.state === "current" ? "step" : undefined}
                  className={`rounded-lg border p-2.5 text-xs ${s.state === "current" ? "border-primary-soft bg-primary/12" : "border-line"}`}
                >
                  <span className={`block ${s.state === "current" ? "font-bold" : s.state === "done" ? "font-medium" : "font-medium text-faint"}`}>
                    {s.label}{s.state === "done" ? " ✓" : ""}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">{s.note}</span>
                </li>
              ))}
            </ol>
            <p className="text-[13px] leading-relaxed text-text/85">{status}</p>
            {(c.pause || c.resume || c.end) && (
              <div className="flex flex-wrap items-center gap-2.5">
                {c.pause && (
                  <button type="button" className={secondary} disabled={pending} onClick={() => run(() => moveAthleteListingAction(listing.id, "PAUSED", null), "Paused — hidden from sponsors.")}>
                    Pause
                  </button>
                )}
                {c.resume && (
                  <button type="button" className={secondary} disabled={pending} onClick={() => run(() => moveAthleteListingAction(listing.id, "PUBLISHED", dirty ? text : null), "Back on the marketplace.")}>
                    {dirty ? "Save and resume" : "Resume"}
                  </button>
                )}
                {c.resume && dirty && (
                  <button type="button" className={secondary} disabled={pending} onClick={() => run(() => saveListingDescriptionAction(listing.id, text), "Saved.")}>
                    Save
                  </button>
                )}
                {end}
              </div>
            )}
          </section>
        )}

        {listing.state === "DRAFT" && (
          <p className="text-[13px] leading-relaxed text-text/85">{status}</p>
        )}
        {failure && listing.state !== "DRAFT" && <FailureNote f={failure} />}
        {notice && !failure && <p role="status" className="text-[11px] text-accent">{notice}</p>}
      </div>

      {rows.length > 0 && <ListChecklist rows={rows} {...(c.canSubmit ? {} : { foot: c.resume ? "Resuming runs these checks again." : "BTG ran these checks when you submitted it." })}>
        {c.canSubmit && (
          <div className="space-y-2">
            <button type="button" className={`${primary} w-full`} disabled={pending} onClick={() => run(() => submitAthleteListingAction(listing.id, dirty ? text : null), "Submitted — BTG is checking it.")}>
              {pending ? "Working…" : "Submit"}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={secondary} disabled={pending || !dirty} onClick={() => run(() => saveListingDescriptionAction(listing.id, text), "Saved.")}>
                Save draft
              </button>
              {end}
            </div>
            {failure && <FailureNote f={failure} />}
          </div>
        )}
      </ListChecklist>}
    </div>
  );
}
