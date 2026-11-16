"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  moveAthleteListingAction, saveListingDescriptionAction, setListingLiveAction, submitAthleteListingAction, type AthleteListingResult,
} from "@/app/(app)/athlete/listings/actions";
import { FailureNote, type Failure } from "@/components/athlete-listing-form";
import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { Modal, SaleSwitch, tilt, untilt, usePopup, useSale } from "@/components/athlete-inventory/inventory-shop";
import { checkSummary, itemChecks, writingMeter, type DeskControls, type JourneyStop, type WizardStep } from "@/lib/athlete-listing-desk";
import { MAX_DESCRIPTION, descriptionCheck, type ApiAthleteListing, type ListCheck } from "@/lib/athlete-listings-live";
import type { ListingTone } from "@/lib/athlete-listings-shop";
import { submitOutcome } from "@/lib/listing-outcome";

/* --------------------------------------------------------------------------
   POL-FE-85 — one listing, /athlete/listings/[id]. The client half:

   - ListingWizard   a draft of the athlete's own: three steps — the item,
                     what the sponsor gets, go live — with a stepper whose
                     track fills, steps that slide in the way you move, and
                     a sponsor's-eye card beside them that follows the
                     typing. Leaving step 2 saves the words (PATCH), so
                     nothing typed is lost; step 3 shows only what decides
                     anything ("6 of 7 ready", the rows to fix) and Submit.
   - ListingBar      once it's submitted (the owner: "after its live/submitted,
                     you will hide the step by step wizard and will show the
                     public page of the item plus a options on how to end
                     this item"): the bar over the item's public showcase —
                     back, one status sentence, Written → Checked → Live, and
                     the one control its state allows (the Live switch, or
                     "Edit what the sponsor gets" in a popup). After a submit
                     or a resume it opens on what happened ("Live ✓", or BTG
                     taking a look).
                     The ways off sit in that bar too, small (the owner: "put
                     this at the top … so that it won't take much space"):
                     the Live switch pauses, "End listing" ends it for good
                     (with a confirm); once ended, "List the item again".
   - EndListing      "End listing" / "Discard this draft", with a confirm
                     popup.

   Same reads and writes as before (./actions.ts). Words from
   lib/athlete-listing-desk.ts; styles in athlete/listings/[id]/listing.css
   over the inventory's inventory.css.
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

export type DeskItem = { kind: string; kindLabel: string; price: string; stock: string; when: string; itemHref: string };
export type DeskSeller = { name: string; initials: string };

/* ── the sponsor's-eye card ────────────────────────────────────────────── */

function SponsorCard({ listing, item, seller, text, href }: { listing: ApiAthleteListing; item: DeskItem; seller: DeskSeller; text: string; href: string }) {
  const words = text.trim();
  return (
    <aside className="sx-ld-peek" aria-label="How sponsors will see it">
      <p className="sx-ld-peek-label">
        <Glyph ui="eye" className="size-3.5" /> How sponsors will see it
      </p>
      <div className="sx-ld-peek-card" data-kind={item.kind} onPointerMove={tilt} onPointerLeave={untilt}>
        <span aria-hidden="true" className="sx-iv-glare" />
        <div className="sx-ld-peek-band">
          <span className="sx-ld-peek-glyph" aria-hidden="true">
            <Glyph kind={item.kind} className="size-7" />
          </span>
          <span className="sx-ld-peek-price sx-arena-num">{item.price}</span>
        </div>
        <div className="sx-ld-peek-body">
          <p className="sx-ld-peek-kind">{item.kindLabel}</p>
          <p className="sx-ld-peek-title">{listing.title}</p>
          <p className="sx-ld-peek-by">
            <span aria-hidden="true">{seller.initials}</span> by {seller.name}
          </p>
          <p className="sx-ld-peek-text" data-empty={words ? undefined : ""}>
            {words || "What the sponsor gets shows here as you write it."}
          </p>
          <p className="sx-ld-peek-cta" aria-hidden="true">
            Add to cart
          </p>
        </div>
      </div>
      <Link href={href} className="sx-ld-link">
        The exact sponsor view <Glyph ui="arrow" className="size-3.5" />
      </Link>
    </aside>
  );
}

/* ── the wizard ────────────────────────────────────────────────────────── */

const STEPS: Array<{ n: WizardStep; label: string; icon: UiGlyph }> = [
  { n: 1, label: "The item", icon: "tag" },
  { n: 2, label: "What they get", icon: "edit" },
  { n: 3, label: "Go live", icon: "bolt" },
];

function Stepper({ step, go }: { step: WizardStep; go: (s: WizardStep) => void }) {
  return (
    <nav aria-label="Steps" className="sx-ld-stepper" style={{ "--p": (step - 1) / 2 } as CSSProperties}>
      <span className="sx-ld-stepper-track" aria-hidden="true">
        <span className="sx-ld-stepper-fill" />
      </span>
      <ol>
        {STEPS.map((s) => (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => go(s.n)}
              aria-current={s.n === step ? "step" : undefined}
              data-state={s.n < step ? "done" : s.n === step ? "now" : "todo"}
              className="sx-ld-stop"
            >
              <span className="sx-ld-stop-dot" aria-hidden="true">
                {s.n < step ? <Glyph ui="check" className="size-4" /> : <Glyph ui={s.icon} className="size-4" />}
              </span>
              <span className="sx-ld-stop-label">
                <span className="sx-ld-stop-n">Step {s.n}</span>
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function CheckRow({ c, jump }: { c: ListCheck; jump?: () => void }) {
  return (
    <li className="sx-ld-check" data-status={c.status}>
      <span className="sx-ld-check-mark" aria-hidden="true">
        <Glyph ui={c.status === "ready" ? "check" : c.status === "fix" ? "close" : "plus"} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sx-ld-check-label">{c.label}</span>
        {c.note && <span className="sx-ld-check-note">{c.note}</span>}
      </span>
      {jump ? (
        <button type="button" onClick={jump} className="sx-ld-check-go">
          Fix it
        </button>
      ) : c.cta ? (
        <Link href={c.cta.href} className="sx-ld-check-go">
          {c.cta.label}
        </Link>
      ) : null}
    </li>
  );
}

export function ListingWizard({
  listing,
  checks,
  start,
  item,
  seller,
}: {
  listing: ApiAthleteListing;
  checks: ListCheck[];
  start: WizardStep;
  item: DeskItem;
  seller: DeskSeller;
}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(start);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const saved = listing.description ?? "";
  const [text, setText] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  /* memory: double-submit-needs-a-ref */
  const lock = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const id = encodeURIComponent(listing.id);

  const dirty = text.trim() !== lastSaved.trim();
  const rows = checks.map((r) => (r.key === "description" ? descriptionCheck(text) : r));
  const summary = checkSummary(rows);
  const items = itemChecks(rows);
  const meter = writingMeter(text);

  /* A new step: its heading takes focus (not on arrival — the page's own focus stays). */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    panel.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [step]);

  const run = async (kind: "save" | "submit", fn: () => Promise<AthleteListingResult>): Promise<AthleteListingResult | null> => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(kind);
    setFailure(null);
    try {
      const r = await fn();
      if (!r.ok) setFailure({ message: r.message, problems: r.problems });
      return r;
    } catch {
      setFailure({ message: "Nothing was saved. Try again in a minute.", problems: [] });
      return null;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  /** Move, saving the words first when they changed (so leaving step 2 never loses them). */
  const go = async (to: WizardStep) => {
    if (to === step) return;
    if (dirty) {
      const r = await run("save", () => saveListingDescriptionAction(listing.id, text));
      if (!r?.ok) return;
      setLastSaved(text);
      setSavedNote(true);
      router.refresh();
    }
    setDir(to > step ? "fwd" : "back");
    setStep(to);
  };

  const submit = async () => {
    const r = await run("submit", () => submitAthleteListingAction(listing.id, dirty ? text : null));
    if (r?.ok) {
      router.replace(`/athlete/listings/${id}?done=1`, { scroll: false });
      router.refresh();
    }
  };

  const fixStep = (c: ListCheck): (() => void) | undefined =>
    c.key === "description" ? () => void go(2) : items.some((i) => i.key === c.key) ? () => void go(1) : undefined;

  return (
    <div className="sx-ld-wizard">
      <div className="sx-ld-wizard-head sx-iv-rise" style={d(0.04)}>
        <Stepper step={step} go={(s) => void go(s)} />
        <p className="sx-ld-draft" role="status">
          <span aria-hidden="true" />
          {busy === "save" ? "Saving…" : savedNote && !dirty ? "Draft saved · only you can see it" : "Draft · only you can see it"}
        </p>
      </div>

      <div className="sx-ld-wizard-body">
        <div ref={panel} key={step} className="sx-ld-panel sx-arena-plate sx-arena-plate-open" data-dir={dir}>
          {step === 1 && (
            <>
              <p className="sx-ld-eyebrow">Step 1 of 3</p>
              <h2 tabIndex={-1} className="sx-ld-q">
                Is this the item you&rsquo;re listing?
              </h2>
              <div className="sx-ld-item" data-kind={item.kind}>
                <span className="sx-iv-icon" aria-hidden="true">
                  <Glyph kind={item.kind} className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="sx-ld-item-title">{listing.title}</span>
                  <span className="sx-ld-item-facts">
                    <span>{item.kindLabel}</span>
                    <span>{item.price} each</span>
                    <span>{item.stock}</span>
                    <span>{item.when}</span>
                  </span>
                </span>
              </div>
              <ul className="sx-ld-checks" aria-label="The item's checks">
                {items.map((c) => (
                  <CheckRow key={c.key} c={c} />
                ))}
              </ul>
              <p className="sx-ld-aside">
                The price, stock and dates come from your item.{" "}
                <Link href={item.itemHref} className="sx-iv-inline-link">
                  Change them in Inventory
                </Link>
                .
              </p>
              <div className="sx-ld-nav">
                <span />
                <button type="button" className="sx-iv-add" onClick={() => void go(2)} disabled={busy !== null}>
                  Yes, next
                  <span className="sx-iv-add-plus" aria-hidden="true">
                    <Glyph ui="arrow" className="size-4" />
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="sx-ld-eyebrow">Step 2 of 3</p>
              <h2 tabIndex={-1} className="sx-ld-q">
                What does the sponsor get?
              </h2>
              <p className="sx-ld-hint">Plain words: what they get, when, and where. This is what sponsors read before they buy.</p>
              <label htmlFor="ld-gets" className="sr-only">
                What the sponsor gets
              </label>
              <textarea
                id="ld-gets"
                rows={6}
                maxLength={MAX_DESCRIPTION}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSavedNote(false);
                }}
                disabled={busy !== null}
                placeholder="e.g. One Instagram post and a story the week of your launch, naming your business, with the photo approved by you first."
                className="sx-ld-text"
              />
              <div className="sx-ld-meter" data-ok={meter.ok ? "" : undefined}>
                <span className="sx-ld-meter-bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${meter.share})` }} />
                </span>
                <span className="sx-ld-meter-label" aria-live="polite">
                  {meter.label}
                </span>
              </div>
              <ul className="sx-ld-tips" aria-label="Good to say">
                <li>
                  <Glyph ui="tag" className="size-3.5" /> What they get
                </li>
                <li>
                  <Glyph ui="calendar" className="size-3.5" /> When
                </li>
                <li>
                  <Glyph ui="pin" className="size-3.5" /> Where
                </li>
              </ul>
              {failure && <FailureNote f={failure} />}
              <div className="sx-ld-nav">
                <button type="button" className="sx-ls-ghost" onClick={() => void go(1)} disabled={busy !== null}>
                  Back
                </button>
                <button type="button" className="sx-iv-add" onClick={() => void go(3)} disabled={busy !== null}>
                  {busy === "save" ? "Saving…" : "Next"}
                  <span className="sx-iv-add-plus" aria-hidden="true">
                    <Glyph ui="arrow" className="size-4" />
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="sx-ld-eyebrow">Step 3 of 3</p>
              <h2 tabIndex={-1} className="sx-ld-q">
                {summary.fix.length ? "Almost there" : "Ready to go live"}
              </h2>
              <div className="sx-ld-ready" data-ok={summary.fix.length ? undefined : ""}>
                <span className="sx-ld-ring" style={{ "--r": summary.total ? summary.ready / summary.total : 0 } as CSSProperties} aria-hidden="true">
                  <span>{summary.ready}</span>
                </span>
                <p>
                  <strong>
                    {summary.ready} of {summary.total} checks pass.
                  </strong>{" "}
                  {summary.fix.length
                    ? `Fix ${summary.fix.length === 1 ? "this one" : `these ${summary.fix.length}`} and it can go live.`
                    : "It goes live as soon as you submit. BTG only steps in when something needs a closer look, and emails you."}
                </p>
              </div>
              {summary.fix.length > 0 && (
                <ul className="sx-ld-checks" aria-label="To fix">
                  {summary.fix.map((c) => (
                    <CheckRow key={c.key} c={c} jump={fixStep(c)} />
                  ))}
                </ul>
              )}
              {summary.optional.length > 0 && (
                <details className="sx-ld-extras">
                  <summary>
                    {summary.optional.length} optional {summary.optional.length === 1 ? "extra" : "extras"}, never needed to go live
                  </summary>
                  <ul className="sx-ld-checks">
                    {summary.optional.map((c) => (
                      <CheckRow key={c.key} c={c} />
                    ))}
                  </ul>
                </details>
              )}
              {failure && <FailureNote f={failure} />}
              <div className="sx-ld-nav">
                <button type="button" className="sx-ls-ghost" onClick={() => void go(2)} disabled={busy !== null}>
                  Back
                </button>
                <button type="button" className="sx-iv-add sx-ld-go" onClick={() => void submit()} disabled={busy !== null || summary.fix.length > 0}>
                  <span className="sx-iv-add-plus" aria-hidden="true">
                    <Glyph ui="bolt" className="size-4" />
                  </span>
                  {busy === "submit" ? "Submitting…" : "Submit & go live"}
                </button>
              </div>
            </>
          )}
        </div>

        <SponsorCard listing={listing} item={item} seller={seller} text={text} href={`/athlete/listings/${id}/preview`} />
      </div>
    </div>
  );
}

/* ── the status view ───────────────────────────────────────────────────── */

function LiveControl({ listing }: { listing: ApiAthleteListing }) {
  const sale = useSale(listing.id, listing.state === "PUBLISHED", setListingLiveAction);
  return (
    <span className="sx-ld-live" title={listing.state === "PUBLISHED" ? "Switch off to pause: hidden from sponsors, nothing lost" : "Switch on to put it back live: the checks run again"}>
      <SaleSwitch {...sale} title={listing.title} words={["Live", "Paused"]} meaning="live on the marketplace" />
      {sale.error && (
        <span role="alert" className="sx-iv-error">
          {sale.error}
        </span>
      )}
    </span>
  );
}

/** "Edit what the sponsor gets" — paused (save, or save and go live) or held for BTG (save and submit again). */
function EditWords({ listing, mode }: { listing: ApiAthleteListing; mode: "resume" | "resubmit" }) {
  const router = useRouter();
  const { phase, opener, show, close } = usePopup();
  const [text, setText] = useState(listing.description ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const lock = useRef(false);
  const meter = writingMeter(text);
  const id = encodeURIComponent(listing.id);

  const run = async (key: string, fn: () => Promise<AthleteListingResult>, outcome: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setFailure(null);
    try {
      const r = await fn();
      if (!r.ok) setFailure({ message: r.message, problems: r.problems });
      else {
        close();
        if (outcome) router.replace(`/athlete/listings/${id}?done=1`, { scroll: false });
        router.refresh();
      }
    } catch {
      setFailure({ message: "Nothing was saved. Try again in a minute.", problems: [] });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className="sx-ls-ghost sx-ld-edit">
        <Glyph ui="edit" className="size-4" /> Edit what the sponsor gets
      </button>
      {phase !== "closed" && (
        <Modal
          close={close}
          closing={phase === "closing"}
          title="What the sponsor gets"
          lede={mode === "resume" ? "It stays paused until you put it back live." : "Changing it sends it back through the checks."}
          icon="edit"
          focus="#ld-edit"
        >
          <div className="sx-iv-new">
            <label htmlFor="ld-edit" className="sr-only">
              What the sponsor gets
            </label>
            <textarea id="ld-edit" rows={7} maxLength={MAX_DESCRIPTION} value={text} onChange={(e) => setText(e.target.value)} disabled={busy !== null} className="sx-ld-text" />
            <div className="sx-ld-meter" data-ok={meter.ok ? "" : undefined}>
              <span className="sx-ld-meter-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${meter.share})` }} />
              </span>
              <span className="sx-ld-meter-label">{meter.label}</span>
            </div>
            {failure && <FailureNote f={failure} />}
            <div className="sx-ls-actions">
              {mode === "resume" ? (
                <>
                  <button type="button" className="sx-iv-add" disabled={busy !== null} onClick={() => void run("live", () => moveAthleteListingAction(listing.id, "PUBLISHED", text), true)}>
                    <span className="sx-iv-add-plus" aria-hidden="true">
                      <Glyph ui="bolt" className="size-4" />
                    </span>
                    {busy === "live" ? "Working…" : "Save & go live"}
                  </button>
                  <button type="button" className="sx-ls-ghost" disabled={busy !== null} onClick={() => void run("save", () => saveListingDescriptionAction(listing.id, text), false)}>
                    {busy === "save" ? "Saving…" : "Save, keep it paused"}
                  </button>
                </>
              ) : (
                <button type="button" className="sx-iv-add" disabled={busy !== null} onClick={() => void run("again", () => submitAthleteListingAction(listing.id, text), true)}>
                  <span className="sx-iv-add-plus" aria-hidden="true">
                    <Glyph ui="bolt" className="size-4" />
                  </span>
                  {busy === "again" ? "Submitting…" : "Save & submit again"}
                </button>
              )}
              <button type="button" className="sx-ls-ghost" onClick={close} disabled={busy !== null}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** After a submit or a resume: "Live ✓", "Goes live on …", or BTG taking a look. */
function Outcome({ listing, href }: { listing: ApiAthleteListing; href: string }) {
  const router = useRouter();
  const o = submitOutcome(listing);
  if (!o) return null;
  const live = o.tone === "accent";
  return (
    <div className="sx-ld-outcome" data-tone={live ? "live" : "wait"} role="status">
      {live && (
        <span className="sx-ld-burst" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ "--a": `${i * 36}deg`, "--i": i } as CSSProperties} />
          ))}
        </span>
      )}
      <span className="sx-ld-outcome-badge" aria-hidden="true">
        <Glyph ui={live ? "check" : "eye"} className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sx-ld-outcome-title">{o.headline}</span>
        {o.lines.map((l) => (
          <span key={l} className="sx-ld-outcome-line">
            {l}
          </span>
        ))}
      </span>
      <button type="button" className="sx-iv-close" aria-label="Dismiss" onClick={() => router.replace(href, { scroll: false })}>
        <Glyph ui="close" className="size-4" />
      </button>
    </div>
  );
}

const TONE_ICON: Record<ListingTone, UiGlyph> = { live: "bolt", soon: "calendar", wait: "eye", fix: "edit", off: "pause", none: "edit", ended: "lock" };

/** The bar over the public showcase: back, where it stands (one sentence and three stops), the one control its state allows. */
export function ListingBar({
  listing,
  status,
  note,
  stops,
  controls,
  done,
  btg,
}: {
  listing: ApiAthleteListing;
  status: { label: string; tone: ListingTone };
  note: string;
  stops: JourneyStop[];
  controls: DeskControls;
  done: boolean;
  btg: string | null;
}) {
  const id = encodeURIComponent(listing.id);
  const own = listing.seller.type === "ATHLETE";
  return (
    <div className="sx-ld-top">
      {done && <Outcome listing={listing} href={`/athlete/listings/${id}`} />}
      <div className="sx-ld-bar sx-iv-rise" data-tone={status.tone} style={d(0)}>
        <Link href="/athlete/listings" className="sx-is-back">
          <Glyph ui="back" className="size-4" />
          Listings
        </Link>
        <div className="sx-ld-bar-status">
          <span className="sx-ld-beacon-dot" aria-hidden="true">
            <Glyph ui={TONE_ICON[status.tone]} className="size-4" />
          </span>
          <span className="min-w-0">
            <strong>{status.label}</strong>
            <span>{note}</span>
          </span>
        </div>
        <ol className="sx-ld-trail" aria-label="Its journey">
          {stops.map((s) => (
            <li key={s.key} data-state={s.state} aria-current={s.state === "now" || s.state === "paused" ? "step" : undefined} title={s.note || undefined}>
              <span aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ol>
        <div className="sx-ld-bar-actions">
          {controls.liveSwitch && <LiveControl listing={listing} />}
          {controls.edit && <EditWords listing={listing} mode={controls.edit} />}
          {own && (
            <Link href={`/athlete/listings/${id}/preview`} className="sx-ld-link" title="The exact card sponsors see in the shop">
              <Glyph ui="eye" className="size-4" /> Shop card
            </Link>
          )}
          {/* the owner: the ways off belong at the top, small — the Live switch pauses; End is the one other way */}
          {controls.end && <EndListing listing={listing} chip />}
          {own && listing.state === "ARCHIVED" && (
            <Link href={`/athlete/listings/new?item=${encodeURIComponent(listing.inventoryItemId)}`} className="sx-iv-add">
              <span className="sx-iv-add-plus" aria-hidden="true">
                <Glyph ui="megaphone" className="size-4" />
              </span>
              List the item again
            </Link>
          )}
        </div>
      </div>
      {btg && (
        <p className="sx-ld-btg sx-iv-rise" style={d(0.06)}>
          {btg}
        </p>
      )}
      <p className="sx-ld-sponsor-view sx-iv-rise" style={d(0.08)}>
        <Glyph ui="eye" className="size-3.5" />
        {own ? "Below is your listing the way sponsors meet it." : `Below is your item the way sponsors meet it. ${listing.seller.name} manages this listing.`}
      </p>
    </div>
  );
}

/* ── ending it ─────────────────────────────────────────────────────────── */

/** `chip`: the small red-outlined button in the status bar (the owner, 2026-11-16: put it at the top, small). */
export function EndListing({ listing, chip = false }: { listing: ApiAthleteListing; chip?: boolean }) {
  const router = useRouter();
  const { phase, opener, show, close } = usePopup();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const lock = useRef(false);
  const draft = listing.state === "DRAFT";
  const end = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const r = await moveAthleteListingAction(listing.id, "ARCHIVED", null);
      if (!r.ok) setFailure({ message: r.message, problems: r.problems });
      else {
        close();
        router.refresh();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className={chip ? "sx-ld-end-chip" : "sx-ld-end"}>
        {chip && <Glyph ui="ban" className="size-3.5" />}
        {draft ? "Discard this draft" : "End listing"}
      </button>
      {phase !== "closed" && (
        <Modal
          close={close}
          closing={phase === "closing"}
          title={draft ? "Discard this draft?" : "End this listing for good?"}
          lede={draft ? "It never went live. You can list the item again any time." : "It comes off the marketplace and can't be undone. Orders already placed carry on."}
          icon="ban"
          tone="danger"
        >
          <div className="sx-iv-new">
            {failure && <FailureNote f={failure} />}
            <div className="sx-ls-actions">
              <button type="button" className="sx-ld-danger" disabled={busy} onClick={() => void end()}>
                {busy ? "Working…" : draft ? "Discard draft" : "End listing"}
              </button>
              <button type="button" className="sx-ls-ghost" onClick={close} disabled={busy}>
                Keep it
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
