import { OpsGround } from "@/components/ops-stage";

/* The Scouting Board's loading screen (P1-ART-16): the stage's dark ground
   with ghost blocks where the title, the four tiles and the first cards land, so
   arriving here never flashes the light portal skeleton. Other admin desks
   keep admin/loading.tsx. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading athlete applications"
      className="sx-ops sx-stage relative isolate -mx-6 -my-6 min-h-[calc(100svh-66px)] overflow-hidden px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10"
    >
      <OpsGround word="" />
      <div aria-hidden="true" className="relative mx-auto max-w-[1440px]">
        <div className="flex items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-64 rounded-md" />
          <div className="sx-ops-ghost hidden h-5 w-40 rounded-full sm:block" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[6.5rem]" />)}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-ghost h-9 w-28 rounded-full" />)}
        </div>
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative min-h-[12.5rem]" />)}
        </div>
      </div>
    </div>
  );
}
