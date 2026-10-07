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
    >
      <div aria-hidden="true">
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
