import { BackLink } from "@/components/back-link";
import { Card, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { compact } from "@/components/line-chart";
import { inventoryItem, money } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";

/* --------------------------------------------------------------------------
   NIL Job / Inventory Detail — §9 screen 7, redesigned per spec 2026-09-11:
   hero band with the sourced stat trio, includes grid, and a "Managed by BTG"
   rail in place of anything resembling checkout (§17).

   §9.7 asks for job code, deliverables, sponsor price, rights, exclusivity,
   dates, usage, approval, status and availability — all on the page. Base
   rate — what the athlete is paid — is absent by design (guide §04). Implied
   CPM is displayed because §15 stores it for learning.
   -------------------------------------------------------------------------- */

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { jobId } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "mk-media");
  const it = inventoryItem;

  return (
    <div className="space-y-5">
      <BackLink target={back} />

      {/* ------------------------------------------------------- hero band */}
      <HeroBand className="sx-animate">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
          <div className="min-w-52 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {it.exclusive && (
                <MiniChip kind="neutral">
                  EXCLUSIVE · {it.durationWeeks} WEEKS
                </MiniChip>
              )}
              <MiniChip kind="neutral">{it.jobId}</MiniChip>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {it.name}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {it.property} · {it.formats.join(" · ")}
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Est. views
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5 text-xl font-bold tabular-nums tracking-tight">
                {compact(it.estViews)} <MiniChip kind="est" />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Implied CPM
              </dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight">
                ${it.cpm}
              </dd>
              <dd className="text-[9px] text-faint">§15 — stored for learning</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Price
              </dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-accent">
                {money(it.estPrice)}
              </dd>
            </div>
          </dl>
        </div>
      </HeroBand>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ------------------------------------------------------- left */}
        <div className="space-y-4">
          <Card className="sx-animate sx-delay-1">
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
          </Card>

          <Card className="sx-animate sx-delay-2">
            <SectionHeading title="About" />
            <p className="text-xs leading-relaxed text-muted">{it.about}</p>
          </Card>
        </div>

        {/* ------------------------------------------------------- rail */}
        <div className="space-y-4">
          {/* Artwork placeholder — real creative lives in the R2 public bucket. */}
          <div className="sx-animate sx-delay-1 relative aspect-4/3 overflow-hidden rounded-xl border border-line">
            <div className="absolute inset-0 bg-gradient-to-br from-[#123049] via-[#0e1d2c] to-[#0a0c10]" />
            <div
              aria-hidden="true"
              className="absolute -right-8 top-1/3 size-56 rounded-full bg-primary/25 blur-[70px]"
            />
            <div className="relative grid h-full place-items-center text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/40">
                  BTG
                </p>
                <p className="mt-1 text-xl font-bold leading-none tracking-tight text-text/75">
                  PLAYER
                </p>
                <p className="text-xl font-bold leading-none tracking-tight text-text/75">
                  OF THE WEEK
                </p>
              </div>
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-text/25">
              creative pending
            </p>
          </div>

          <Card className="sx-animate sx-delay-2 border-accent/30 bg-gradient-to-br from-accent/12 to-surface">
            <p className="text-xs font-semibold tracking-tight">
              Managed by BTG
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Request this inventory and BTG matches the athletes, checks
              category conflicts and sends one invoice. No checkout — Phase 1
              is a managed marketplace (§17).
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                title="Creates a CampaignBrief in DRAFT — not wired"
                className="w-full rounded-lg bg-accent py-2.5 text-xs font-semibold text-white transition-colors hover:bg-accent-soft"
              >
                Request this inventory
              </button>
              <button
                type="button"
                title="Opens a conversation with BTG — not wired"
                className="w-full rounded-lg border border-line py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Talk to BTG
              </button>
            </div>
          </Card>
        </div>
      </div>

      <p className="text-[10px] text-faint">
        Fixture data — requested job{" "}
        <code className="font-mono">{jobId}</code>. The athlete&rsquo;s base
        rate does not appear on this page (guide §04).
      </p>
    </div>
  );
}
