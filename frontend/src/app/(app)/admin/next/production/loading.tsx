import { ProductionSkeleton } from "@/components/production-desk";

import "../../applications/(queue)/applications.css";
import "../../new-signups/(stream)/signups.css";
import "./production.css";

/* The production board's loading screen (P9-FE-16): the stage's dark ground
   with a skeleton in the page's own shape — the title with its pill and two
   buttons, its two lines, the four cards, the toolbar and the first rows of
   the list — so arriving here never flashes the light portal skeleton. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the production board">
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-52 max-w-full rounded-md" />
          <div className="flex items-center gap-2">
            <div className="sx-ops-ghost hidden h-6 w-44 rounded-full sm:block" />
            <div className="sx-ops-ghost h-[34px] w-32 rounded-md" />
            <div className="sx-ops-ghost h-[34px] w-28 rounded-md" />
          </div>
        </div>
        <div className="sx-ops-ghost mt-3 h-3.5 w-[30rem] max-w-full rounded" />
        <div className="sx-ops-ghost mt-2 h-3 w-72 max-w-full rounded" />
        <div className="sx-ap-stats mt-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[7.75rem]" />
          ))}
        </div>
        <div className="mb-2.5 mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="sx-ops-ghost h-10 w-80 max-w-full rounded-md" />
          <div className="sx-ops-ghost h-9 w-40 rounded-md" />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="sx-ops-ghost h-9 w-64 max-w-full rounded-md" />
          <div className="sx-ops-ghost hidden h-9 w-40 rounded-md sm:block" />
          <div className="sx-ops-ghost hidden h-9 w-36 rounded-md sm:block" />
        </div>
        <ProductionSkeleton />
      </div>
    </div>
  );
}
