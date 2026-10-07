/* The Operations Board's loading screen (P1-ART-14): the stage's own dark
   ground with ghost blocks where the hero, the four queue cards and the
   lower panels will land — so arriving at /admin never flashes the light
   portal skeleton before the night stage. The other admin desks keep
   admin/loading.tsx. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading the Operations Board"
    >
      <div aria-hidden="true">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
          <div className="w-full max-w-3xl space-y-4">
            <div className="sx-ops-ghost h-3 w-64 rounded-full" />
            <div className="sx-ops-ghost h-[clamp(34px,4.6vw,68px)] w-[min(100%,34rem)] rounded-lg" />
            <div className="sx-ops-ghost h-[clamp(34px,4.6vw,68px)] w-[min(90%,30rem)] rounded-lg" />
            <div className="sx-ops-ghost h-4 w-[min(100%,26rem)] rounded-full" />
          </div>
          <div className="sx-ops-ghost size-[clamp(168px,17vw,240px)] shrink-0 rounded-full" />
        </div>
        <div className="mt-10 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sx-ops-panel sx-ops-ghost relative min-h-[172px]" />
          ))}
        </div>
        <div className="mt-10 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="sx-ops-panel sx-ops-ghost relative min-h-[18rem]" />
          <div className="sx-ops-panel sx-ops-ghost relative min-h-[18rem]" />
        </div>
      </div>
    </div>
  );
}
