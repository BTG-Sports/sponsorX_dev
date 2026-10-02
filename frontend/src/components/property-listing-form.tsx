"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createListingAction, moveListingAction, saveListingAction, submitListingAction, type ListingResult } from "@/app/(app)/property/listings/actions";
import {
  governanceChecklist,
  listingControls,
  listingPatch,
  publishDateInput,
  publishDateIso,
  type ApiListing,
  type ListingDraft,
} from "@/lib/property-p2-live";
import { btgNote, GOES_LIVE_COPY, submitOutcome } from "@/lib/listing-outcome";

/* --------------------------------------------------------------------------
   2S3-FE-01 — the listing editor's client island.

   The wording, visibility and publish day of one listing, with the
   governance checklist beside it. Property and item rules come from the
   API's `blockers`; the listing's own rules re-run on every keystroke, so
   the checklist is live. 2S3-FE-04 — a submit goes live as soon as the
   checks pass; a flagged one waits for BTG ("BTG is taking a look"), with
   the restricted words named so the manager can edit them out. Writes go through the server actions; a refusal is
   shown in the API's words, a 422's problems as a list. After a write the
   page re-reads the listing (router.refresh) and the draft follows it.
   -------------------------------------------------------------------------- */

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const lbl = "block text-[11px] font-medium text-muted";
const primaryBtn =
  "rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn = "rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

type Failure = { message: string; problems: string[] };

function Fields({ draft, set, disabled }: { draft: ListingDraft; set: (d: ListingDraft) => void; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className={lbl}>Title</span>
        <input className={field} value={draft.title} maxLength={200} disabled={disabled} placeholder="e.g. Game Day package" onChange={(e) => set({ ...draft, title: e.target.value })} />
      </label>
      <label className="block">
        <span className={lbl}>What the sponsor gets</span>
        <textarea
          className={field}
          rows={5}
          maxLength={8000}
          disabled={disabled}
          value={draft.description}
          placeholder="Describe what's delivered, when and where. At least 20 characters."
          onChange={(e) => set({ ...draft, description: e.target.value })}
        />
      </label>
      <fieldset>
        <legend className={lbl}>Visibility</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["PUBLIC", "Public", "Any sponsor browsing the marketplace can find it."],
              ["PRIVATE", "Private", "Kept out of marketplace search."],
            ] as const
          ).map(([v, l, s]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${draft.visibility === v ? "border-primary/60 bg-primary/5" : "border-line"}`}>
              <input type="radio" name="visibility" className="mt-0.5 accent-[var(--sx-primary)]" checked={draft.visibility === v} disabled={disabled} onChange={() => set({ ...draft, visibility: v })} />
              <span>
                <span className="block text-xs font-medium">{l}</span>
                <span className="block text-[11px] text-muted">{s}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block sm:max-w-xs">
        <span className={lbl}>Go live no earlier than (optional)</span>
        <input
          type="date"
          className={field}
          disabled={disabled}
          value={publishDateInput(draft.publishAt)}
          onChange={(e) => set({ ...draft, publishAt: publishDateIso(e.target.value) })}
        />
        <span className="mt-1 block text-[11px] text-faint">Once the checks pass, it goes on sale that day (UTC), or straight away if that day has passed.</span>
      </label>
    </div>
  );
}

function Checklist({ rows }: { rows: ReturnType<typeof governanceChecklist> }) {
  const open = rows.filter((r) => !r.ok).length;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold">Before it can go live</p>
      <p className="mt-0.5 text-[11px] text-muted">{open === 0 ? "Everything is in place." : `${open} thing${open === 1 ? "" : "s"} to fix first.`}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-xs">
            <span aria-hidden="true" className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${r.ok ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"}`}>
              {r.ok ? "✓" : "!"}
            </span>
            <span>
              <span className={r.ok ? "text-text" : "font-medium text-text"}>{r.label}</span>
              <span className="sr-only">{r.ok ? " — done" : " — not yet"}</span>
              {r.note && <span className="block text-[11px] text-muted">{r.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FailureNote({ f }: { f: Failure }) {
  return (
    <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
      <p>{f.problems.length ? "Not ready to go live yet:" : f.message}</p>
      {f.problems.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {f.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Live ✓", or "BTG is taking a look" with what the seller can fix — and a BTG pause or end, with BTG's reason. */
function Outcome({ listing, justSubmitted }: { listing: ApiListing; justSubmitted: boolean }) {
  const o = submitOutcome(listing);
  const note = btgNote(listing);
  const show = o && (o.tone === "warn" || justSubmitted);
  if (!show && !note) return null;
  return (
    <div role="status" className="space-y-2">
      {show && (
        <div className={`rounded-lg px-3 py-2 text-xs ${o.tone === "accent" ? "bg-accent/10 text-accent" : "border border-warn/30 bg-warn/8 text-warn"}`}>
          <p className="font-semibold">{o.headline}</p>
          {o.lines.map((l) => (
            <p key={l} className="mt-0.5 text-[11px]">
              {l}
            </p>
          ))}
        </div>
      )}
      {note && <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[11px] text-danger">{note}</p>}
    </div>
  );
}

/** The editor for an existing listing. */
export function PropertyListingEditor({ listing }: { listing: ApiListing }) {
  const router = useRouter();
  const saved: ListingDraft = { title: listing.title, description: listing.description ?? "", visibility: listing.visibility, publishAt: listing.publishAt };
  const [draft, setDraft] = useState<ListingDraft>(saved);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [pending, start] = useTransition();
  /* The page re-read the listing after a write: take the saved version as
     the new draft (adjusting state during render, not in an effect). */
  const [seen, setSeen] = useState(listing.updatedAt);
  if (listing.updatedAt !== seen) {
    setSeen(listing.updatedAt);
    setDraft(saved);
  }

  const controls = listingControls(listing.state);
  const dirty = controls.editable && Object.keys(listingPatch(saved, draft)).length > 0;
  const checklist = governanceChecklist(listing.blockers, draft, listing.item);
  const clear = checklist.every((r) => r.ok);

  const held = listing.state === "PENDING_APPROVAL";
  const run = (fn: () => Promise<ListingResult>, done: string | null, submitted = false) =>
    start(async () => {
      setFailure(null);
      setNotice(null);
      setJustSubmitted(false);
      const r = await fn();
      if (r.ok) {
        setNotice(done);
        setJustSubmitted(submitted);
        setConfirmArchive(false);
        router.refresh();
      } else {
        setFailure({ message: r.message, problems: r.problems });
        router.refresh();
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <Fields draft={draft} set={setDraft} disabled={!controls.editable || pending} />
          {!controls.editable && (
            <p className="mt-4 text-[11px] text-muted">
              {listing.state === "PUBLISHED" ? "It's on sale, so the wording is locked. Pause it to edit." : "Archived listings can't be edited."}
            </p>
          )}
        </div>

        {!failure && <Outcome listing={listing} justSubmitted={justSubmitted} />}
        {failure && <FailureNote f={failure} />}
        {notice && !failure && (
          <p role="status" className="text-[11px] text-accent">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {controls.canSubmit && (
            <button
              type="button"
              className={primaryBtn}
              disabled={pending || (held && !dirty)}
              title={held && !dirty ? "Edit it first — BTG is already taking a look" : undefined}
              onClick={() => run(() => submitListingAction(listing.id, dirty ? draft : null), null, true)}
            >
              {pending ? "Working…" : held ? "Save and submit again" : dirty ? "Save and submit" : "Submit"}
            </button>
          )}
          {controls.editable && !held && (
            <button type="button" className={controls.canSubmit ? secondaryBtn : primaryBtn} disabled={pending || !dirty} onClick={() => run(() => saveListingAction(listing.id, draft), "Saved.")}>
              {controls.canSubmit ? "Save draft" : "Save changes"}
            </button>
          )}
          {controls.moves
            .filter((m) => m.to !== "ARCHIVED")
            .map((m) => (
              <button
                key={m.to}
                type="button"
                className={secondaryBtn}
                disabled={pending}
                onClick={() =>
                  m.to === "PAUSED"
                    ? run(() => moveListingAction(listing.id, m.to, null), "Paused — hidden from sponsors.")
                    : run(() => moveListingAction(listing.id, m.to, dirty ? draft : null), null, true)
                }
              >
                {m.to === "PUBLISHED" && dirty ? "Save and resume" : m.label}
              </button>
            ))}
          {controls.moves.some((m) => m.to === "ARCHIVED") &&
            (confirmArchive ? (
              <span className="flex items-center gap-2 text-[11px]">
                <span className="text-muted">Archive for good? It can&rsquo;t be undone.</span>
                <button type="button" className="rounded-lg bg-danger px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40" disabled={pending} onClick={() => run(() => moveListingAction(listing.id, "ARCHIVED", null), "Archived.")}>
                  Archive
                </button>
                <button type="button" className="text-muted hover:text-text" onClick={() => setConfirmArchive(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="ml-auto text-[11px] text-muted hover:text-danger" disabled={pending} onClick={() => setConfirmArchive(true)}>
                Archive…
              </button>
            ))}
        </div>
        {controls.canSubmit && (
          <p className="text-[11px] text-faint">
            {GOES_LIVE_COPY}
            {clear ? "" : " It can't go live until the checklist is clear."}
          </p>
        )}
        {listing.state === "PAUSED" && <p className="text-[11px] text-faint">Resuming runs the checks again. {GOES_LIVE_COPY}</p>}
      </div>

      <aside className="space-y-4">{listing.state !== "ARCHIVED" && <Checklist rows={checklist} />}</aside>
    </div>
  );
}

/** A new listing on one inventory item. On success, opens the new listing. */
export function PropertyListingCreate({ itemId, itemTitle, itemDescription, availableUntil }: { itemId: string; itemTitle: string; itemDescription: string | null; availableUntil: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ListingDraft>({ title: itemTitle, description: itemDescription ?? "", visibility: "PUBLIC", publishAt: null });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, start] = useTransition();
  /* The property and item rules are unknown until the listing exists (the
     API computes them); the wording rules can be checked already. */
  const checklist = governanceChecklist([], draft, { availableUntil }).filter((r) => ["title", "description", "timing"].includes(r.key));

  const create = () =>
    start(async () => {
      setFailure(null);
      const r = await createListingAction(itemId, draft);
      if (r.ok) router.push(`/property/listings/${r.listing.id}`);
      else setFailure({ message: r.message, problems: r.problems });
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <Fields draft={draft} set={setDraft} disabled={pending} />
        </div>
        {failure && <FailureNote f={failure} />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} disabled={pending} onClick={create}>
            {pending ? "Creating…" : "Create draft listing"}
          </button>
          <Link href="/property/listings/new" className={secondaryBtn}>
            Choose another item
          </Link>
        </div>
        <p className="text-[11px] text-faint">It starts as a draft only you can see. Submit it from the next screen — {GOES_LIVE_COPY.charAt(0).toLowerCase() + GOES_LIVE_COPY.slice(1)}</p>
      </div>
      <aside>
        <Checklist rows={checklist} />
        <p className="mt-2 text-[11px] text-faint">Your property&rsquo;s approval and the item&rsquo;s stock, price and window are checked once the draft exists.</p>
      </aside>
    </div>
  );
}
