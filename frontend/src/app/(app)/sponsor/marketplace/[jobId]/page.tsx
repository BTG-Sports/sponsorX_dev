import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { BlockedNotice, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { StadiumHead, StadiumPanel, StadiumTile, StadiumTiles, at } from "@/components/stadium-stage";
import { inventoryItem } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";

/* --------------------------------------------------------------------------
   One job — §9 screen 7, restyled on the Stadium Board (P1-ART-23, spec
   2026-10-11 §7.7): Head with a "Request this" action, three tiles off the
   fixture, then the details panel and the "Managed by BTG" rail in place of
   anything resembling checkout (§17). Restyle only — it stays on fixtures,
   as today (the plan doesn't wire this page to a real catalogue read).

   §9.7 asks for job code, deliverables, sponsor price, rights, exclusivity,
   dates, usage, approval, status and availability — all on the page. Base
   rate — what the athlete is paid — is absent by design (guide §04). The
   "implied CPM" figure is kept (§15 stores it for learning) but in plain
   words — "What you pay per 1,000 people reached" — with the jargon and the
   §15 note behind a hint instead of printed on screen.
   -------------------------------------------------------------------------- */

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "mk-media");
  const it = inventoryItem;

  const requestThis = (
    <button
      type="button"
      title="Your request goes to BTG, who match athletes and agree the price"
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-cta-ink"
    >
      Request this
    </button>
  );

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* C-5 (check pass): this is the demo media-property detail — linked
          only from the demo "Media properties" tab, but reachable by URL, so
          it must say what it is to a signed-in sponsor. */}
      <BlockedNotice>
        Demo data — a sample media-property listing. BTG&rsquo;s own media
        properties aren&rsquo;t bookable in Phase 1; browse the packages and
        job types on the{" "}
        <Link href="/sponsor/marketplace" className="underline">marketplace</Link>.
      </BlockedNotice>

      <StadiumHead title={it.name} pill="Sample data" actions={requestThis}>
        <div className="sx-stadium-in flex flex-wrap items-center gap-2" style={at(0.04)}>
          {it.exclusive && (
            <MiniChip kind="neutral">
              Exclusive · {it.durationWeeks} weeks
            </MiniChip>
          )}
          <span className="text-xs text-muted">
            {it.property} · {it.formats.join(" · ")}
          </span>
        </div>
        <StadiumTiles cols={3}>
          <StadiumTile
            label="Estimated views"
            value={it.estViews}
            hint="How many people we expect this to reach. An estimate, not a checked figure."
            delay={0.1}
          />
          <StadiumTile
            label="What you pay per 1,000 people reached"
            value={it.cpm * 100}
            format="usd0"
            hint="The estimated reach divided into the price, times 1,000 — a quick way to compare listings. Stored for learning, not a guarantee."
            delay={0.16}
          />
          <StadiumTile
            label="Price"
            value={it.estPrice}
            format="usd0"
            hint="What this would cost, all in."
            delay={0.22}
          />
        </StadiumTiles>
      </StadiumHead>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ------------------------------------------------------- left */}
        <div className="space-y-4">
          <StadiumPanel delay={0.3}>
            <SectionHeading title="What's included" />
            <ul className="grid gap-2 sm:grid-cols-2">
              {it.includes.map((i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-success" aria-hidden="true">
                    ✓
                  </span>
                  <span className="text-muted">{i}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
              Usage rights: {it.usageRights} · {it.approval}
            </p>
          </StadiumPanel>

          <StadiumPanel delay={0.36}>
            <SectionHeading title="About" />
            <p className="text-xs leading-relaxed text-muted">{it.about}</p>
          </StadiumPanel>
        </div>

        {/* ------------------------------------------------------- rail */}
        <div className="space-y-4">
          {/* Artwork placeholder — real creative lives in the R2 public bucket. */}
          <div className="sx-stadium-in relative aspect-4/3 overflow-hidden rounded-[6px] border border-line" style={at(0.3)}>
            <div className="absolute inset-0 bg-gradient-to-br from-[#1c1511] via-[#15110e] to-[#0b0a09]" />
            <div
              aria-hidden="true"
              className="absolute -right-8 top-1/3 size-56 rounded-full bg-sponsor/25 blur-[70px]"
            />
            <div className="relative grid h-full place-items-center text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-media/40">
                  BTG
                </p>
                <p className="mt-1 text-xl font-bold leading-none tracking-tight text-on-media/75">
                  PLAYER
                </p>
                <p className="text-xl font-bold leading-none tracking-tight text-on-media/75">
                  OF THE WEEK
                </p>
              </div>
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-on-media/25">
              creative pending
            </p>
          </div>

          <StadiumPanel delay={0.36}>
            <p className="text-xs font-semibold tracking-tight">
              Managed by BTG
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Request this and BTG matches the athletes, checks category
              conflicts and sends one invoice. No checkout — Phase 1 is a
              managed marketplace (§17).
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                title="Your request goes to BTG, who match athletes and agree the price"
                className="w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
              >
                Request this
              </button>
              <button
                type="button"
                title="Opens a conversation with BTG — not wired"
                className="w-full rounded-lg border border-line py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Talk to BTG
              </button>
            </div>
          </StadiumPanel>
        </div>
      </div>

      <p className="text-[10px] text-faint">
        Fixture data. The athlete&rsquo;s base rate does not appear on this
        page (guide §04).
      </p>
    </div>
  );
}
