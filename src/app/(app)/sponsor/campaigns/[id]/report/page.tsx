import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Card, SectionHeading, SourceLabel } from "@/components/ui";
import { resolveBack } from "@/lib/back";
import { LineChart } from "@/components/line-chart";
import { roiReport, roiSeries } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor ROI / Campaign Report — §9 screen 12, mockup screen 12.

   This screen is why the PDF worker exists: "Download PDF" renders on the
   worker via Playwright (guide §10), never in this request. Report
   generation is exactly the long-running work that belongs in a job.

   §9.12 and §22 require verified and estimated figures to be distinguished,
   so every number here carries its source. Media Value is `estimated` and
   Revenue Attributed is `attributed` — the two softest numbers on the page,
   and the two a sponsor is most likely to quote back.
   -------------------------------------------------------------------------- */

export default async function RoiReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "sponsor");
  const r = roiReport;

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ROI Report</h1>
          <p className="mt-1 text-xs text-muted">
            {r.campaign} · Presented by {r.presentedBy}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="Queues render-report on the worker (Playwright) — not wired"
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
              aria-hidden="true"
            >
              <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />
            </svg>
            Download PDF
          </button>
          <button
            type="button"
            title="Range picker — not wired"
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            {r.period}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-3"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem] xl:items-start">
        {/* ---------------------------------------------- delivery figures */}
        <section className="min-w-0">
          <SectionHeading title="Delivery" />
          <Card className="p-0">
            <dl className="divide-y divide-line-soft">
              {r.left.map((row) => (
                <div key={row.label} className="px-4 py-3">
                  <dt className="text-[11px] text-muted">{row.label}</dt>
                  <dd className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums tracking-tight">
                      {row.value}
                    </span>
                  </dd>
                  <div className="mt-1.5">
                    <SourceLabel source={row.source} />
                  </div>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        {/* --------------------------------------------------- efficiency */}
        <section className="min-w-0">
          <SectionHeading title="Efficiency" />
          <Card className="p-0">
            <dl className="divide-y divide-line-soft">
              {r.right.map((row) => (
                <div key={row.label} className="px-4 py-3">
                  <dt className="text-[11px] text-muted">{row.label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                    {row.value}
                  </dd>
                  <div className="mt-1.5">
                    <SourceLabel source={row.source} />
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="mt-4 border-warn/30 bg-warn/8">
            <p className="text-[11px] leading-relaxed text-warn">
              Media Value is <strong>estimated</strong> and Revenue Attributed
              is <strong>attributed</strong>, not measured. §22 makes that
              distinction mandatory, and §16 notes Phase 1 has no
              payment-network attribution — merchant validation and unique
              coupon redemption is what stands behind these numbers.
            </p>
          </Card>
        </section>

        {/* --------------------------------------------------------- roi */}
        <section className="min-w-0">
          <SectionHeading title="Return" />
          <Card>
            <p className="text-center text-4xl font-bold tracking-tight text-accent">
              {r.roi}
            </p>
            <p className="mt-1 text-center text-[10px] text-faint">
              revenue attributed ÷ investment
            </p>

            <div className="mt-5 border-t border-line-soft pt-4">
              <p className="mb-2 text-[11px] font-medium text-muted">
                Return Over Time
              </p>
              <LineChart
                points={roiSeries}
                aName="Return"
                fmtA={(n) => `${n.toFixed(0)}X`}
                height={170}
                xTicks={3}
              />
            </div>
          </Card>

          <Card className="mt-4">
            <p className="text-[11px] font-medium text-muted">Recommendation</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              §9.12 asks for recommendations and a renewal path. Highest
              return came from the reel format at the Creator tier; the
              appearance job under-delivered.
            </p>
            <Link
              href="/sponsor/marketplace?from=report"
              className="mt-3 block rounded-lg bg-primary py-2 text-center text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
            >
              Plan the renewal
            </Link>
          </Card>
        </section>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px]">
        <Link
          href={`/admin/campaigns/${id}?from=report`}
          className="text-accent hover:underline"
        >
          → Operations view for this campaign
        </Link>
        <Link href="/admin/analytics?from=report" className="text-accent hover:underline">
          → Reward analytics
        </Link>
      </div>

      <p className="text-[10px] text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data.
      </p>
    </div>
  );
}
