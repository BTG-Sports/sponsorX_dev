import Link from "next/link";

import { Badge, Card, Meter, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { EditionFlatplan } from "@/components/edition-flatplan";
import { BookCampaign } from "@/components/edition-sell";
import { ContentReadyToggle, EditionAdvance } from "@/components/edition-controls";
import { EmptyState } from "@/components/states";
import { money } from "@/lib/fixtures";
import {
  daysUntil,
  rackByKind,
  shortDate,
  toFlatplan,
  type ApiEdition,
  type ApiLedgerSlot,
  type ApiSaleCandidate,
  type ApiSlotKind,
} from "@/lib/editions-live";
import { noEditionHint, readJson, type LiveEditions } from "../live";
import { artworkGate, artworkStatus } from "@/lib/edition-artwork-live";

/* --------------------------------------------------------------------------
   P9-FE-03 — the page map on the AdSlot ledger. Same screen as the fixture
   plan (P1-FE-21); every number is the ledger's: slot state and buyer from
   GET /editions/:id/ledger, the gates from the edition's own conditions and
   the digital rights gap, committed revenue from sold values.

   The back cover cannot go to a second campaign from here: booking lists
   only packages this edition can still honour (sale-candidates), and the
   sale itself is all-or-nothing in the ledger (P9-BE-03).

   P9-BE-16 — a fourth gate: every SOLD slot's ad artwork approved by its
   sponsor on the approval board. The ledger carries each sold slot's artwork
   for BTG's desk, so the gate names the slots holding production up — the
   same answer the transition gives — and the "Ad artwork" card lists each.
   -------------------------------------------------------------------------- */

const SELLERS = ["SUPER_ADMIN", "BTG_ADMIN"];

const KIND_SHORT: Record<ApiSlotKind, string> = {
  FULL: "Full pages",
  HALF: "Half pages",
  QUARTER: "Quarters",
  BACK_COVER: "Back cover",
  PRESENTING: "Presenting",
};

const STATE_TONE: Record<string, "primary" | "warn" | "neutral" | "accent" | "danger"> = {
  PLANNING: "neutral",
  SELLING: "primary",
  CLOSED: "warn",
  IN_PRODUCTION: "warn",
  PUBLISHED_DIGITAL: "accent",
  PRINTED: "accent",
  DISTRIBUTED: "accent",
  CANCELLED: "danger",
};

export function EditionSwitcher({ editions, current, base }: { editions: ApiEdition[]; current: ApiEdition; base: string }) {
  const many = new Set(editions.map((e) => e.publication.id)).size > 1;
  return (
    <nav aria-label="Editions" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
      {editions.map((e) => (
        <Link
          key={e.id}
          href={`${base}?edition=${encodeURIComponent(e.id)}`}
          aria-current={e.id === current.id ? "page" : undefined}
          className={[
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            e.id === current.id ? "bg-next/15 text-next" : "text-muted hover:text-text",
          ].join(" ")}
        >
          {e.label}
          {many && <span className="text-muted"> · {e.publication.name}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function NextHeading({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">
          {title}{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">{sub}</p>
      </div>
      {/* min-w-0 + max-w-full: the edition switcher scrolls inside this slot
          instead of widening the page past a phone (first-pass QA, 390px). */}
      {right && <div className="min-w-0 max-w-full">{right}</div>}
    </div>
  );
}

export async function LiveEditionPlanning({ live, initialOpenPage, now }: { live: LiveEditions; initialOpenPage?: number; now: number }) {
  const e = live.current;
  if (!e) {
    return (
      <div className="space-y-6">
        <NextHeading title="Editions" sub="Publications and their editions" />
        <EmptyState
          mark="chart"
          {...noEditionHint(live, "An edition is created on its publication with a close date and a threshold, then laid out at the editorial meeting.")}
        />
      </div>
    );
  }

  const seller = live.roles.some((r) => SELLERS.includes(r));
  const [ledger, sale] = await Promise.all([
    readJson<{ slots: ApiLedgerSlot[] }>(`/editions/${encodeURIComponent(e.id)}/ledger`),
    seller ? readJson<{ candidates: ApiSaleCandidate[] }>(`/editions/${encodeURIComponent(e.id)}/sale-candidates`) : null,
  ]);
  const slots = ledger.body?.slots ?? [];
  const plan = toFlatplan(slots, e.pageCount);
  const kinds = rackByKind(slots);
  const sold = slots.filter((s) => s.sold).length;

  const committed = e.inventory.committedCents;
  const pct = e.thresholdCents ? Math.min(100, Math.round((committed / e.thresholdCents) * 100)) : 100;
  const shortfall = Math.max(0, e.thresholdCents - committed);
  const days = daysUntil(e.closeDate, now);
  const selling = e.state === "SELLING" && Date.parse(e.closeDate) > now;
  const closeSoon = selling && days <= 7;

  const art = artworkGate(slots);
  const artPending = art ? art.blockers.length : e.artworkPending ?? null;
  const gates = [
    {
      key: "content",
      label: "Content ready",
      sub: e.contentReady ? "marked ready by BTG" : "not yet marked ready",
      pass: e.contentReady,
    },
    {
      key: "rights",
      label: "Rights cleared",
      sub:
        e.rightsPending == null
          ? e.rightsCleared ? "cleared at the production gate" : "checked at the production gate"
          : e.rightsPending === 0
            ? "every asset has a digital right in force"
            : `${e.rightsPending} asset${e.rightsPending === 1 ? "" : "s"} without a digital right`,
      pass: e.rightsPending == null ? e.rightsCleared : e.rightsPending === 0,
    },
    {
      key: "revenue",
      label: "Revenue met",
      sub: e.revenueMet ? "frozen at close" : `${money(committed)} of ${money(e.thresholdCents)}`,
      pass: e.revenueMet || committed >= e.thresholdCents,
    },
    {
      key: "artwork",
      label: "Ad artwork approved",
      sub:
        artPending == null
          ? "checked at the production gate"
          : sold === 0
            ? "no ads sold — nothing to approve"
            : artPending === 0
              ? `all ${sold} sold ad${sold === 1 ? "" : "s"} signed off by their sponsors`
              : `${artPending} of ${sold} sold ad${sold === 1 ? "" : "s"} not yet approved`,
      pass: artPending === 0,
    },
  ];

  return (
    <div className="space-y-6">
      <NextHeading
        title="Editions"
        sub={e.publication.name}
        right={<EditionSwitcher editions={live.editions} current={e} base="/admin/next/editions" />}
      />

      <HeroBand border="border-next/30" className="sx-animate">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATE_TONE[e.state] ?? "neutral"}>{e.state.replace("_", " ")}</Badge>
            <Badge tone={closeSoon ? "warn" : "neutral"}>
              {selling ? `closes ${shortDate(e.closeDate)} · ${days} day${days === 1 ? "" : "s"}` : `ads closed ${shortDate(e.closeDate)}`}
            </Badge>
            <Badge tone="neutral">publish target {shortDate(e.publishTarget)}</Badge>
            {seller && <div className="ml-auto"><EditionAdvance editionId={e.id} state={e.state} /></div>}
          </div>

          {/* §5.2 — all four must hold for production (artwork: P9-BE-16) */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {gates.map((g) => (
              <div
                key={g.key}
                className={["rounded-lg border px-3 py-2.5", g.pass ? "border-success/40 bg-success/8" : "border-line bg-surface/60"].join(" ")}
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span aria-hidden="true" className={g.pass ? "text-success" : "text-faint"}>
                    {g.pass ? "✓" : "○"}
                  </span>
                  {g.label}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{g.sub}</p>
                {g.key === "content" && seller && !["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED", "CANCELLED"].includes(e.state) && (
                  <div className="mt-1.5"><ContentReadyToggle editionId={e.id} ready={e.contentReady} /></div>
                )}
                {g.key === "rights" && (
                  <Link href={`/admin/next/rights?edition=${encodeURIComponent(e.id)}`} className="mt-1.5 inline-block text-[11px] font-medium text-next hover:text-next-soft">Rights ledger →</Link>
                )}
                {g.key === "artwork" && art && art.blockers.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
                    {art.blockers.map((b) => (
                      <li key={b} className="[overflow-wrap:anywhere]">· {b}</li>
                    ))}
                  </ul>
                )}
                {g.key === "artwork" && sold > 0 && (
                  <Link href="/admin/approvals" className="mt-1.5 inline-block text-[11px] font-medium text-next hover:text-next-soft">Approval board →</Link>
                )}
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-muted">
                <span className="font-semibold text-text">{money(committed)}</span> of {money(e.thresholdCents)} minimum viable
                {shortfall > 0 ? (
                  <>
                    {" "}— <span className="font-medium text-next">{money(shortfall)} to go</span>
                  </>
                ) : (
                  " — met"
                )}
              </span>
              <span className="tabular-nums text-faint">{pct}%</span>
            </div>
            <div className="mt-1.5">
              <Meter value={pct} tone="next" />
            </div>
          </div>
        </div>
      </HeroBand>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading title="The flatplan" hint={slots.length ? "Every position in the issue — tap a page for its slots" : "No positions laid out yet"} />
          {slots.length === 0 ? (
            <EmptyState mark="chart" title="No inventory yet" hint="Add positions from the inventory ledger — the flatplan draws them by slot code (P04-QTR sits on page 4)." />
          ) : (
            <EditionFlatplan
              pages={plan.pages}
              backCover={plan.backCover}
              closeDate={shortDate(e.closeDate)}
              initialOpenPage={initialOpenPage}
              live
            />
          )}
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
            slot state and buyers from the AdSlot ledger <MiniChip kind="ver">POSTGRES</MiniChip>
            <Link href={`/admin/next/inventory?edition=${encodeURIComponent(e.id)}`} className="ml-1 font-medium text-next hover:text-next-soft">
              Open the ledger →
            </Link>
          </p>
        </section>

        <div className="min-w-0 space-y-6">
          {seller && sale?.body && (
            <section className="sx-animate sx-delay-2">
              <SectionHeading title="Sell" />
              <BookCampaign editionId={e.id} candidates={sale.body.candidates} selling={selling} />
            </section>
          )}

          {art && art.sold > 0 && (
            <section className="sx-animate sx-delay-2">
              <SectionHeading title="Ad artwork" hint="BTG reviews, the sponsor signs off" />
              <Card className="p-0">
                <ul className="divide-y divide-line-soft">
                  {slots.filter((sl) => sl.sold).map((sl) => {
                    const st = artworkStatus(sl.artwork?.state ?? null, Boolean(sl.artwork?.revision));
                    return (
                      <li key={sl.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                        <span className="min-w-0">
                          <span className="block font-medium">{sl.slotCode}</span>
                          <span className="block truncate text-[11px] text-muted">{sl.buyer?.sponsor ?? "Taken"}</span>
                        </span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-line-soft px-4 py-3 text-[10px] leading-relaxed text-faint">
                  The edition goes to production only once every sold ad is approved by its sponsor.
                </p>
              </Card>
            </section>
          )}

          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Inventory" />
            <Card>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xl font-semibold tabular-nums text-next">{sold}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted">sold</p>
                </div>
                <div>
                  <p className="text-xl font-semibold tabular-nums">{slots.length - sold}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted">open</p>
                </div>
              </div>
              {kinds.length > 0 && (
                <ul className="mt-4 space-y-2.5 border-t border-line-soft pt-3.5">
                  {kinds.map((k) => (
                    <li key={k.kind}>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-muted">{KIND_SHORT[k.kind]}</span>
                        <span className="tabular-nums text-faint">
                          {k.sold}/{k.total} sold
                        </span>
                      </div>
                      <div className="mt-1">
                        <Meter value={(k.sold / k.total) * 100} tone="next" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {plan.presenting && (
                <p className="mt-3 border-t border-line-soft pt-3 text-[11px] text-muted">
                  Presenting sponsor ·{" "}
                  {plan.presenting.sold ? (
                    <span className="font-medium text-text">{plan.presenting.buyer?.sponsor ?? "taken"}</span>
                  ) : (
                    "open"
                  )}
                </p>
              )}
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Close date" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span className={["text-2xl font-semibold tabular-nums tracking-tight", closeSoon ? "text-warn" : ""].join(" ")}>
                  {selling ? days : "—"}
                </span>
                <span className="text-[11px] text-faint">
                  {selling ? `days · ads close ${shortDate(e.closeDate)}` : `ads closed ${shortDate(e.closeDate)}`}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Positions still open at close are filled editorially. Nothing sells after this date — the ledger refuses it.
              </p>
            </Card>
          </section>

          {kinds.length > 0 && (
            <section className="sx-animate sx-delay-4">
              <SectionHeading title="Rack card" />
              <Card className="p-0">
                <ul className="divide-y divide-line-soft">
                  {kinds.map((k) => (
                    <li key={k.kind} className="flex items-center justify-between px-4 py-2.5 text-xs">
                      <span className="text-muted">{KIND_SHORT[k.kind]}</span>
                      <span className="font-medium tabular-nums">
                        {k.min === k.max ? money(k.min) : `${money(k.min)}–${money(k.max)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line-soft px-4 py-3 text-[10px] leading-relaxed text-faint">
                  This edition&rsquo;s rack prices. A sale&rsquo;s value is the package price, spread across its positions and frozen at sale.
                </p>
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
