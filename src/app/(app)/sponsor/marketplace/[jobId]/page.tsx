import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, Card, SectionHeading, SourceLabel } from "@/components/ui";
import { inventoryItem, money } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";

/* --------------------------------------------------------------------------
   NIL Job / Inventory Detail — §9 screen 7, mockup screen 7.

   §9.7 asks for job code, athlete, deliverables, base rate, sponsor price,
   rights, exclusivity, dates, usage, geography, required approval, status and
   availability. The mockup covers price, CPM, views, exclusivity, duration
   and the includes list; usage rights and the approval requirement are added
   here because a sponsor signing off on inventory needs them on the page.

   Base rate — what the athlete is paid — is absent by design (guide §04).
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
    <div className="space-y-6">
      <BackLink target={back} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* ------------------------------------------------------- left */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{it.name}</h1>
              <p className="mt-1 text-xs text-muted">{it.property}</p>
            </div>
            <Badge tone="neutral">{it.jobId}</Badge>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {it.formats.map((f, i) => (
              <span
                key={f}
                className={[
                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                  i === 0
                    ? "bg-primary/15 text-primary-soft"
                    : "bg-surface-2 text-muted",
                ].join(" ")}
              >
                {f}
              </span>
            ))}
          </div>

          <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted">
            {it.about}
          </p>

          {/* ---------------------------------------------- stat strip */}
          <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            <div className="bg-surface px-4 py-4">
              <dd className="text-lg font-semibold tabular-nums tracking-tight">
                {it.estViews.toLocaleString()}
              </dd>
              <dt className="mt-0.5 text-[10px] text-muted">Est. Views</dt>
              <div className="mt-1.5">
                <SourceLabel source="ESTIMATED" />
              </div>
            </div>
            <div className="bg-surface px-4 py-4">
              <dd className="text-lg font-semibold tabular-nums tracking-tight">
                ${it.cpm}
              </dd>
              <dt className="mt-0.5 text-[10px] text-muted">CPM</dt>
            </div>
            <div className="bg-surface px-4 py-4">
              <dd className="text-lg font-semibold tabular-nums tracking-tight">
                {money(it.estPrice)}
              </dd>
              <dt className="mt-0.5 text-[10px] text-muted">Est. Price</dt>
            </div>
          </dl>

          {/* ------------------------------------------------ includes */}
          <section className="mt-8">
            <SectionHeading title="Includes" />
            <Card>
              <ul className="grid gap-2 sm:grid-cols-2">
                {it.includes.map((i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-accent" aria-hidden="true">
                      ✓
                    </span>
                    <span className="text-muted">{i}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* ------------------------------------ rights and approval */}
          <section className="mt-6">
            <SectionHeading
              title="Terms"
              hint="§9.7 — rights, usage and approval belong on the page a sponsor buys from"
            />
            <Card className="p-0">
              <dl className="divide-y divide-line-soft">
                {[
                  ["Usage rights", it.usageRights],
                  ["Approval", it.approval],
                  ["Exclusivity", it.exclusive ? "Category exclusive" : "Non-exclusive"],
                  ["Duration", `${it.durationWeeks} weeks`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4 px-4 py-2.5">
                    <dt className="w-28 shrink-0 text-[11px] text-faint">{k}</dt>
                    <dd className="text-[11px] text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>
        </div>

        {/* ------------------------------------------------------- right */}
        <div className="space-y-4">
          {/* Artwork placeholder — real creative lives in the R2 public bucket. */}
          <div className="relative aspect-4/3 overflow-hidden rounded-xl border border-line">
            <div className="absolute inset-0 bg-gradient-to-br from-[#2a1c4d] via-[#1a1430] to-[#0e1016]" />
            <div
              aria-hidden="true"
              className="absolute -right-8 top-1/3 size-56 rounded-full bg-primary/25 blur-[70px]"
            />
            <div className="relative grid h-full place-items-center text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  BTG
                </p>
                <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white/75">
                  PLAYER
                </p>
                <p className="text-xl font-bold leading-none tracking-tight text-white/75">
                  OF THE WEEK
                </p>
              </div>
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/25">
              creative pending
            </p>
          </div>

          <Card>
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[11px] text-muted">Availability</dt>
                <dd className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
                  <span aria-hidden="true">✓</span> Exclusive
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[11px] text-muted">Duration</dt>
                <dd className="text-[11px] font-medium">
                  {it.durationWeeks} Weeks
                </dd>
              </div>
            </dl>

            <Link
              href="/admin/campaigns/new?from=inventory"
              className="mt-5 block rounded-lg bg-primary py-2.5 text-center text-xs font-medium text-white transition-colors hover:bg-primary-soft"
            >
              Add to Campaign
            </Link>
            <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
              Opens the campaign builder. Phase 1 is managed — this reserves
              inventory against a brief, it does not check out (§17).
            </p>
          </Card>
        </div>
      </div>

      <p className="text-[10px] text-faint">
        Fixture data — requested job{" "}
        <code className="font-mono">{jobId}</code>.
      </p>
    </div>
  );
}
