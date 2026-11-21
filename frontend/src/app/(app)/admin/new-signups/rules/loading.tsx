/* Sign-up rules' loading screen: the stage's dark ground with ghost blocks
   in the page's own shape (redrawn 2026-11-21) — the title row, chapter 01's
   three rule cards, chapter 02's search bar, then the country rail and the
   country panel — so arriving here never flashes the light skeleton. */
function Chapter() {
  return (
    <div className="mt-10 flex items-center gap-3.5">
      <div className="sx-ops-ghost size-10 rounded-md" />
      <div className="space-y-2">
        <div className="sx-ops-ghost h-4 w-52 rounded" />
        <div className="sx-ops-ghost h-3 w-72 max-w-[60vw] rounded" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div role="status" aria-label="Loading the sign-up rules">
      <div aria-hidden="true">
        <div className="sx-ops-ghost h-3 w-28 rounded-full" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-56 rounded-md" />
          <div className="flex gap-2">
            <div className="sx-ops-ghost hidden h-8 w-48 rounded-full sm:block" />
            <div className="sx-ops-ghost h-8 w-32 rounded-md" />
          </div>
        </div>
        <div className="sx-ops-ghost mt-3 h-3.5 w-96 max-w-full rounded" />

        <Chapter />
        <div className="mt-5 grid grid-cols-1 gap-3.5 min-[1100px]:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[19rem]" />)}
        </div>

        <Chapter />
        <div className="mt-5 flex justify-end gap-2">
          <div className="sx-ops-ghost h-10 w-full rounded-md lg:w-[26rem]" />
          <div className="sx-ops-ghost h-10 w-36 shrink-0 rounded-md" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          {/* rules-board.tsx PANEL_H: one fixed height per width, the same for both */}
          <div className="sx-ops-panel sx-ops-ghost relative h-[32rem] sm:h-[34rem] lg:h-[38rem] xl:h-[42rem]" />
          <div className="sx-ops-panel sx-ops-ghost relative h-[32rem] sm:h-[34rem] lg:h-[38rem] xl:h-[42rem]" />
        </div>
      </div>
    </div>
  );
}
