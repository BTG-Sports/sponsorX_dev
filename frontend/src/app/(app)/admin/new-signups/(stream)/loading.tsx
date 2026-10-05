import { OpsGround } from "@/components/ops-stage";

/* New sign-ups' loading screen (P1-ART-15): the stage's dark ground with
   ghost blocks where the title, the four tiles, the filter bar and the stream's rows land, so
   arriving here never flashes the light portal skeleton. Lives in the
   (stream) route group so a sign-up's own page (athletes/[id], guardians/[id])
   and the rules keep admin/loading.tsx. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading New sign-ups"
      className="sx-ops sx-stage relative isolate -mx-6 -my-6 min-h-[calc(100svh-66px)] overflow-hidden px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10"
    >
      <OpsGround word="" />
      <div aria-hidden="true" className="relative mx-auto max-w-[1440px]">
        <div className="flex items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-56 rounded-md" />
          <div className="sx-ops-ghost h-9 w-32" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[6.5rem]" />)}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sx-ops-ghost h-9 w-28 rounded-full" />)}
        </div>
        <div className="sx-ops-panel relative mt-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-white/5 px-5 py-4">
              <div className="sx-ops-ghost size-10" />
              <div className="sx-ops-ghost h-4 flex-1 rounded-full" />
              <div className="sx-ops-ghost hidden h-4 w-40 rounded-full md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
