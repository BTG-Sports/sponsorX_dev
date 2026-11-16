"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { draftListingAction, listItemAction, setListingLiveAction } from "@/app/(app)/athlete/listings/actions";
import { DescriptionField, FailureNote, ListChecklist, type Failure } from "@/components/athlete-listing-form";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { Modal, SaleSwitch, ShopTabs, ViewSwitch, tilt, untilt, usePopup, useSale, useShopView } from "@/components/athlete-inventory/inventory-shop";
import { ListSearch, PagerRow, PendingList } from "@/components/server-pager";
import { descriptionCheck, type ApiAthleteListing } from "@/lib/athlete-listings-live";
import { listingTabPatch, type ListingCard, type ListingTab, type ListingTabDef, type ReadyItem } from "@/lib/athlete-listings-shop";
import type { PageInfo } from "@/lib/list-query";
import { submitOutcome } from "@/lib/listing-outcome";

/* --------------------------------------------------------------------------
   POL-FE-84 — the athlete's listings, drawn like their inventory (POL-FE-83).
   The client half:

   - ListingsShop  the tabs (All / Live / In review / Drafts / Paused /
                   Ended, with the API's counts), the search, List ↔ Cards
                   (the same remembered choice as Inventory), and the
                   listings. Each of the seller's own live or paused listings
                   has a Live switch (the old Pause / Resume buttons) that
                   flips at once and rolls back with the API's sentence if
                   the move is refused; every other listing says what to do
                   next ("Finish & submit") and opens on a click.
   - ListAnItem    "+ List an item": a popup in two steps — pick one of the
                   items with no listing yet, then say what the sponsor gets,
                   with "What's checked" beside it — and List it (create +
                   submit, as the compose page did) or Save as draft. It
                   ends on what happened: "Live ✓", or BTG taking a look.
                   With no listings yet it's the page's hero instead, the
                   items as tiles that open the popup on their own step 2.

   The page (server) reads everything and words it (lib/athlete-listings-
   shop.ts); nothing here invents a number. Styles: the inventory's
   inventory.css plus ./listings.css.
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

/* ── one listing ───────────────────────────────────────────────────────── */

function StatusPill({ card }: { card: ListingCard }) {
  return (
    <span className="sx-iv-state" data-tone={card.status.tone}>
      <span className="sx-iv-state-dot" aria-hidden="true" />
      {card.status.label}
    </span>
  );
}

/** Live ↔ Paused, for the seller's own published or paused listing. */
function LiveSwitch({ card }: { card: ListingCard & { live: boolean } }) {
  const sale = useSale(card.id, card.live, setListingLiveAction);
  return (
    <span className="sx-ls-switch">
      <SaleSwitch {...sale} title={card.title} words={["Live", "Paused"]} meaning="live on the marketplace" />
      {sale.error && (
        <span role="alert" className="sx-iv-error">
          {sale.error}
        </span>
      )}
    </span>
  );
}

function Control({ card }: { card: ListingCard }) {
  if (card.live !== null) return <LiveSwitch card={card as ListingCard & { live: boolean }} />;
  return (
    <span className="sx-ls-cta" data-tone={card.status.tone} aria-hidden="true">
      {card.own ? card.cta : "Your team’s"}
    </span>
  );
}

function ListingRow({ card, i, href }: { card: ListingCard; i: number; href: string }) {
  return (
    <li className="sx-iv-rise" style={d(0.04 + i * 0.035)}>
      <div className="sx-iv-row" data-kind={card.kind} data-on={card.status.tone === "live" || card.status.tone === "soon" ? "" : undefined}>
        <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
          <Glyph kind={card.kind} className="size-[18px]" />
        </span>
        <span className="sx-iv-row-main">
          <Link href={href} className="sx-iv-stretch sx-iv-row-title">
            {card.title}
          </Link>
          <span className="sx-iv-row-sub">
            <span>{card.own ? card.kindLabel : `${card.kindLabel} · by ${card.seller}`}</span>
            <StatusPill card={card} />
          </span>
        </span>
        <span className="sx-iv-row-cell sx-iv-row-price">
          <span className="sx-arena-num">{card.price}</span>
        </span>
        <span className="sx-iv-row-cell">
          <span className="sx-iv-stock" data-tone={card.stock.tone}>
            {card.stock.label}
          </span>
        </span>
        <span className="sx-iv-row-cell sx-iv-when">Updated {card.updated}</span>
        <span className="sx-iv-row-cell sx-iv-row-switch">
          <Control card={card} />
        </span>
        <span aria-hidden="true" className="sx-iv-row-go">
          <Glyph ui="arrow" className="size-4" />
        </span>
      </div>
    </li>
  );
}

function ListingTile({ card, i, href }: { card: ListingCard; i: number; href: string }) {
  return (
    <li className="sx-iv-rise" style={d(0.06 + i * 0.05)}>
      <article
        className="sx-iv-card"
        data-kind={card.kind}
        data-on={card.status.tone === "live" || card.status.tone === "soon" ? "" : undefined}
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <span aria-hidden="true" className="sx-iv-glare" />
        <div className="sx-iv-card-top">
          <span className="sx-iv-icon" aria-hidden="true">
            <Glyph kind={card.kind} className="size-6" />
          </span>
          <StatusPill card={card} />
        </div>
        <h3 className="sx-iv-card-title">
          <Link href={href} className="sx-iv-stretch">
            {card.title}
          </Link>
        </h3>
        <p className="sx-iv-kind">{card.own ? card.kindLabel : `${card.kindLabel} · by ${card.seller}`}</p>
        <p className="sx-iv-blurb">{card.note}</p>
        <div className="sx-iv-facts">
          <p className="sx-iv-price">
            <span className="sx-arena-num">{card.price}</span>
            <span className="sx-iv-each">each</span>
          </p>
          <p className="sx-iv-stock" data-tone={card.stock.tone}>
            {card.stock.label}
          </p>
        </div>
        <p className="sx-iv-when">
          <Glyph ui="calendar" className="size-3.5" />
          Updated {card.updated}
        </p>
        <div className="sx-iv-card-foot">
          <Control card={card} />
          <span aria-hidden="true" className="sx-iv-edit">
            Open <Glyph ui="arrow" className="size-3.5" />
          </span>
        </div>
      </article>
    </li>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

export function ListingsShop({
  cards,
  tabs,
  tab,
  q,
  filtered,
  page,
  hrefBase,
  empty,
}: {
  cards: ListingCard[];
  tabs: ListingTabDef[];
  tab: ListingTab;
  q: string;
  filtered: boolean;
  page: PageInfo;
  hrefBase: string;
  empty: { title: string; hint: string };
}) {
  const view = useShopView();
  const href = (id: string) => `${hrefBase}/${encodeURIComponent(id)}`;
  return (
    <div className="sx-iv-shop">
      <div className="sx-iv-toolbar sx-iv-rise" style={d(0.02)}>
        <ShopTabs<ListingTabDef> tabs={tabs} tab={tab} patch={listingTabPatch} label="Show listings" />
        <div className="sx-iv-toolbar-end">
          <ListSearch initial={q} label="Search listings" placeholder="Search your listings" tone="athlete" />
          <ViewSwitch view={view} />
        </div>
      </div>

      <p className="sx-iv-hint sx-iv-rise" style={d(0.05)}>
        <Glyph ui="bolt" className="size-3.5" />
        <span>
          A listing puts an item from your{" "}
          <Link href="/athlete/inventory" className="sx-iv-inline-link">
            Inventory
          </Link>{" "}
          on the marketplace. It goes <strong>Live</strong> as soon as the checks pass; BTG only steps in when something needs a closer look.
        </span>
      </p>

      <div className="sx-iv-rise" style={d(0.06)}>
        <PagerRow page={page} noun="Listings" tone="athlete" position="top" filtered={filtered} />
      </div>

      <PendingList>
        {cards.length === 0 ? (
          <div className="sx-iv-none sx-iv-rise" style={d(0.08)}>
            <span className="sx-iv-none-mark" aria-hidden="true">
              <Glyph ui="megaphone" className="size-7" />
            </span>
            <p className="sx-iv-none-title">{empty.title}</p>
            <p className="sx-iv-none-hint">{empty.hint}</p>
          </div>
        ) : view === "list" ? (
          <div key="list" className="sx-iv-list">
            <div className="sx-iv-list-head" aria-hidden="true">
              <span>Listing</span>
              <span>Price</span>
              <span>Stock</span>
              <span>Updated</span>
              <span>Live</span>
            </div>
            <ul aria-label="Your listings">
              {cards.map((c, i) => (
                <ListingRow key={c.id} card={c} i={i} href={href(c.id)} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Your listings" className="sx-iv-grid">
            {cards.map((c, i) => (
              <ListingTile key={c.id} card={c} i={i} href={href(c.id)} />
            ))}
          </ul>
        )}
      </PendingList>

      {cards.length > 0 && <PagerRow page={page} noun="Listings" tone="athlete" position="bottom" />}
    </div>
  );
}

/* ── listing an item: pick → write → done ──────────────────────────────── */

function ItemTile({ item, i, pick }: { item: ReadyItem; i: number; pick: (id: string) => void }) {
  return (
    <li className="sx-iv-rise" style={d(0.06 + i * 0.04)}>
      <button type="button" data-kind={item.kind} onClick={() => pick(item.id)} className="sx-iv-idea sx-ls-pick">
        <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
          <Glyph kind={item.kind} className="size-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="sx-iv-idea-name">{item.title}</span>
          <span className="sx-iv-idea-hint">
            {item.kindLabel} · {item.price} · {item.stock.label}
            {item.paused ? " · paused in Inventory" : ""}
          </span>
        </span>
        <span className="sx-iv-idea-go" aria-hidden="true">
          <Glyph ui="arrow" className="size-3.5" />
        </span>
      </button>
    </li>
  );
}

function PickStep({ ready, more, pick }: { ready: ReadyItem[]; more: number; pick: (id: string) => void }) {
  if (ready.length === 0) {
    return (
      <div className="sx-iv-none">
        <span className="sx-iv-none-mark" aria-hidden="true">
          <Glyph ui="check" className="size-7" />
        </span>
        <p className="sx-iv-none-title">Every item already has a listing</p>
        <p className="sx-iv-none-hint">One listing per item. Add another item in Inventory, then list it here.</p>
        <Link href="/athlete/inventory" className="sx-iv-add mt-2">
          <span className="sx-iv-add-plus" aria-hidden="true">
            <Glyph ui="plus" className="size-4" />
          </span>
          Add an item in Inventory
        </Link>
      </div>
    );
  }
  return (
    <div className="sx-iv-new">
      <p className="sx-iv-new-step">
        <span aria-hidden="true">1</span> Which item?
      </p>
      <ul className="sx-ls-picks" aria-label="Items with no listing yet">
        {ready.map((item, i) => (
          <ItemTile key={item.id} item={item} i={i} pick={pick} />
        ))}
      </ul>
      {more > 0 && (
        <p className="sx-iv-ban-none">
          And {more} more. Search for one in{" "}
          <Link href="/athlete/inventory?unlisted=true" className="sx-iv-inline-link">
            Inventory
          </Link>
          .
        </p>
      )}
    </div>
  );
}

type Done = { listing: ApiAthleteListing; draft: boolean };

function WriteStep({ item, back, done }: { item: ReadyItem; back: (() => void) | null; done: (d: Done) => void }) {
  const router = useRouter();
  const [text, setText] = useState(item.initial);
  const [busy, setBusy] = useState<"list" | "draft" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  /* memory: double-submit-needs-a-ref */
  const lock = useRef(false);
  const rows = item.checks.map((r) => (r.key === "description" ? descriptionCheck(text) : r));

  const go = async (draft: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(draft ? "draft" : "list");
    setFailure(null);
    try {
      const r = draft ? await draftListingAction(item.id, item.title, text) : await listItemAction(item.id, item.title, text);
      if (r.ok) done({ listing: r.listing, draft });
      else setFailure({ message: r.message, problems: r.problems, draftId: r.draftId });
      router.refresh();
    } catch {
      setFailure({ message: "Nothing was saved. Try again in a minute.", problems: [] });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="sx-iv-new">
      <div className="sx-ls-picked" data-kind={item.kind}>
        <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
          <Glyph kind={item.kind} className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="sx-iv-idea-name">{item.title}</span>
          <span className="sx-iv-idea-hint">
            {item.kindLabel} · {item.price} each · {item.stock.label}
          </span>
        </span>
        {back && (
          <button type="button" onClick={back} className="sx-ls-change">
            Change
          </button>
        )}
      </div>
      {item.paused && (
        <p className="sx-ls-warn" role="note">
          This item is paused in Inventory, so it can&rsquo;t go live. Switch it to Available there first, or save this as a draft for now.
        </p>
      )}
      <p className="sx-iv-new-step">
        <span aria-hidden="true">2</span> What does the sponsor get?
      </p>
      <DescriptionField value={text} set={setText} disabled={busy !== null} />
      <ListChecklist rows={rows}>
        <div className="sx-ls-actions">
          <button type="button" className="sx-iv-add" disabled={busy !== null} onClick={() => go(false)}>
            <span className="sx-iv-add-plus" aria-hidden="true">
              <Glyph ui="megaphone" className="size-4" />
            </span>
            {busy === "list" ? "Listing…" : "List it"}
          </button>
          <button type="button" className="sx-ls-ghost" disabled={busy !== null} onClick={() => go(true)}>
            {busy === "draft" ? "Saving…" : "Save as draft"}
          </button>
        </div>
        {failure && <FailureNote f={failure} />}
      </ListChecklist>
    </div>
  );
}

function DoneStep({ done, again, href }: { done: Done; again: (() => void) | null; href: string }) {
  const o = done.draft ? null : submitOutcome(done.listing);
  const live = o?.tone === "accent";
  return (
    <div className="sx-ls-done" data-tone={live ? "live" : done.draft ? "draft" : "wait"} role="status">
      <span className="sx-ls-done-badge" aria-hidden="true">
        <Glyph ui={live ? "check" : done.draft ? "edit" : "eye"} className="size-8" />
      </span>
      <p className="sx-ls-done-title">{done.draft ? "Saved as a draft" : (o?.headline ?? "Submitted")}</p>
      <p className="sx-iv-none-hint">
        {done.draft ? "Only you can see it. Open it any time to finish it and submit." : (o?.lines.join(" ") ?? "")}
      </p>
      <div className="sx-ls-actions sx-ls-actions-center">
        <Link href={href} className="sx-iv-add">
          <span className="sx-iv-add-plus" aria-hidden="true">
            <Glyph ui="arrow" className="size-4" />
          </span>
          Open the listing
        </Link>
        {again && (
          <button type="button" className="sx-ls-ghost" onClick={again}>
            List another item
          </button>
        )}
      </div>
    </div>
  );
}

/** "+ List an item" and its popup. `hero`: the page's first-listing hero, the items as tiles. */
export function ListAnItem({ ready, more, hrefBase, hero = false }: { ready: ReadyItem[]; more: number; hrefBase: string; hero?: boolean }) {
  const { phase, opener, show, close } = usePopup();
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const item = ready.find((r) => r.id === picked) ?? null;
  /* After a listing the page refreshes and the item leaves `ready`: keep showing "done". */
  const left = ready.filter((r) => r.id !== done?.listing.inventoryItemId);

  const open = (id: string | null = null) => {
    setPicked(id);
    setDone(null);
    show();
  };
  const step = done ? "done" : item ? "write" : "pick";
  /* A step's button unmounts as the next step arrives: hand focus on, or Escape and Tab are lost to the page. */
  useEffect(() => {
    if (phase !== "open") return;
    const t = window.setTimeout(() => {
      const box = document.querySelector<HTMLElement>(".sx-iv-modal [role=dialog]");
      const to = step === "write" ? "#li-gets" : step === "done" ? ".sx-ls-done a" : ".sx-ls-pick";
      (box?.querySelector<HTMLElement>(to) ?? box?.querySelector<HTMLElement>(".sx-iv-close"))?.focus();
    }, 140);
    return () => window.clearTimeout(t);
  }, [step, phase]);

  const popup =
    phase !== "closed" ? (
      <Modal
        close={close}
        closing={phase === "closing"}
        title={step === "done" ? "Listed" : step === "write" ? `List: ${item!.title}` : "List an item"}
        lede={
          step === "pick"
            ? "Pick an item from your Inventory. One listing per item."
            : step === "write"
              ? "Say what the sponsor gets. It goes live as soon as the checks pass."
              : "Here's where it stands."
        }
        icon="megaphone"
        focus={step === "write" ? "#li-gets" : undefined}
      >
        {step === "done" ? (
          <DoneStep
            done={done!}
            href={`${hrefBase}/${encodeURIComponent(done!.listing.id)}`}
            again={left.length > 0 ? () => { setDone(null); setPicked(null); } : null}
          />
        ) : step === "write" ? (
          <WriteStep key={item!.id} item={item!} back={ready.length > 1 ? () => setPicked(null) : null} done={setDone} />
        ) : (
          <PickStep ready={left} more={more} pick={setPicked} />
        )}
      </Modal>
    ) : null;

  if (hero) {
    return (
      <div className="sx-iv-start">
        <button ref={opener} type="button" onClick={() => open(ready.length === 1 ? ready[0].id : null)} aria-haspopup="dialog" className="sx-iv-add sx-iv-add-big">
          <span className="sx-iv-add-plus" aria-hidden="true">
            <Glyph ui="megaphone" className="size-5" />
          </span>
          List your first item
        </button>
        {ready.length > 0 && (
          <>
            <p className="sx-iv-start-or">or pick one</p>
            <ul className="sx-iv-ideas">
              {ready.slice(0, 6).map((r, i) => (
                <li key={r.id} className="sx-iv-rise" style={d(0.3 + i * 0.06)}>
                  <button type="button" data-kind={r.kind} onClick={() => open(r.id)} aria-haspopup="dialog" className="sx-iv-idea">
                    <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
                      <Glyph kind={r.kind} className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="sx-iv-idea-name">{r.title}</span>
                      <span className="sx-iv-idea-hint">
                        {r.kindLabel} · {r.price}
                      </span>
                    </span>
                    <span className="sx-iv-idea-go" aria-hidden="true">
                      <Glyph ui="arrow" className="size-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {popup}
      </div>
    );
  }
  return (
    <>
      <button ref={opener} type="button" onClick={() => open()} aria-haspopup="dialog" className="sx-iv-add">
        <span className="sx-iv-add-plus" aria-hidden="true">
          <Glyph ui="plus" className="size-4" />
        </span>
        List an item
        {ready.length + more > 0 && <span className="sx-ls-count">{ready.length + more}</span>}
      </button>
      {popup}
    </>
  );
}
