import { OpsGround } from "@/components/ops-stage";

/* New sign-ups' loading screen (P1-ART-15): the stage's dark ground with
   ghost blocks where the hero, the filter bar and the stream's rows land, so
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
      <OpsGround word="INTAKE" />
      <div aria-hidden="true" className="relative mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-3xl space-y-4">
            <div className="sx-ops-ghost h-3 w-56 rounded-full" />
            <div className="sx-ops-ghost h-[clamp(32px,4.2vw,62px)] w-[min(100%,38rem)] rounded-lg" />
            <div className="sx-ops-ghost h-[clamp(32px,4.2vw,62px)] w-[min(70%,22rem)] rounded-lg" />
          </div>
          <div className="grid grid-cols-4 gap-6">
            {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-ghost h-12 w-20 rounded-md" />)}
          </div>
        </div>
        <div className="mt-12 flex flex-wrap gap-2">
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
