import { OpsGround } from "@/components/ops-stage";

/* Sign-up rules' loading screen (P1-ART-17): the stage's dark ground with
   ghost blocks where the title, the four tiles, the minors panel, the
   country rail and the country panel land — so arriving here never flashes the light skeleton. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading the sign-up rules"
      className="sx-ops sx-stage relative isolate -mx-6 -my-6 min-h-[calc(100svh-66px)] overflow-hidden px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10"
    >
      <OpsGround word="" />
      <div aria-hidden="true" className="relative mx-auto max-w-[1440px]">
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
