/* Sign-up rules' loading screen (P1-ART-17): the stage's dark ground with
   ghost blocks where the title, the four tiles, the minors panel, the
   country rail and the country panel land — so arriving here never flashes the light skeleton. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading the sign-up rules"
    >
      <div aria-hidden="true">
        <div className="sx-ops-ghost h-3 w-28 rounded-full" />
        <div className="sx-ops-ghost mt-4 h-7 w-56 rounded-md" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[6.5rem]" />)}
        </div>
        <div className="sx-ops-panel sx-ops-ghost relative mt-8 h-40" />
        <div className="mt-8 grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="sx-ops-panel sx-ops-ghost relative h-[24rem]" />
          <div className="sx-ops-panel sx-ops-ghost relative h-[24rem]" />
        </div>
      </div>
    </div>
  );
}
