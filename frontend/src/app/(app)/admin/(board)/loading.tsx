import { Bone, SkCard, SkChart, SkGauge, SkBars, SkDonut, SkKpi, SkPeriodLine, SkRows, SkTable } from "@/components/ops-skeleton";

import "./dash.css";

/* The admin dashboard's loading screen (P1-ART-14, POL-FE-105): a skeleton
   of the dashboard itself on the stage's dark ground — every card drawn as
   its own outline (icon, title and subtitle lines, then rows, a ring, bars,
   a chart or a table) where it will land, so arriving at /admin shows the
   page taking shape, never a blank or the light portal skeleton (owner,
   2026-11-17: skeleton screens as Facebook's and Medium's). The other
   admin desks keep admin/loading.tsx. A period change on the page uses the
   same pieces (components/ops-pending.tsx). */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the dashboard" className="relative">
      <span aria-hidden="true" className="sx-opsd-loadbar" />
      <div aria-hidden="true" className="space-y-5">
        {/* title row + period line */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <Bone w={8} h={8} round />
            <Bone w={150} h={22} />
            <Bone w={150} h={22} round />
            <Bone w={220} h={30} className="sm:ml-auto" />
          </div>
          <SkPeriodLine />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SkKpi key={i} />)}
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <SkCard wide className="lg:col-span-8">
            <SkChart />
          </SkCard>
          <SkCard flush className="lg:col-span-4">
            <SkRows rows={5} />
          </SkCard>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkCard>
            <SkGauge />
          </SkCard>
          <SkCard>
            <SkBars />
          </SkCard>
          <SkCard>
            <SkDonut />
          </SkCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <SkCard flush wide className="lg:col-span-7">
            <SkRows rows={3} mark="tile" right="pill" />
          </SkCard>
          <SkCard flush className="lg:col-span-5">
            <SkRows rows={5} mark="dot" right="word" />
          </SkCard>
        </div>

        <SkCard flush wide>
          <SkTable rows={4} />
        </SkCard>
      </div>
      <span className="sr-only">Loading the dashboard…</span>
    </div>
  );
}
