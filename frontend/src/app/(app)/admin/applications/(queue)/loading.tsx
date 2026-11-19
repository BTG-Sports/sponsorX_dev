import { SkeletonRows } from "@/components/applications-desk";

import "./applications.css";

/* The applications desk's loading screen (P1-ART-16; redrawn POL-FE-106):
   the stage's dark ground with a skeleton in the page's own shape — the
   title, its "How it works" button and its line, the four status cards,
   the toolbar and the first rows of the list — so arriving here never flashes
   the light portal skeleton. Other admin desks keep admin/loading.tsx. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading athlete applications">
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div className="sx-ops-ghost h-7 w-64 max-w-full rounded-md" />
          <div className="flex items-center gap-2">
            <div className="sx-ops-ghost hidden h-6 w-44 rounded-full sm:block" />
            <div className="sx-ops-ghost h-[34px] w-32 rounded-md" />
          </div>
        </div>
        <div className="sx-ops-ghost mt-3 h-3.5 w-[28rem] max-w-full rounded" />
        <div className="sx-ap-stats mt-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[7.25rem]" />
          ))}
        </div>
        <div className="mb-2.5 mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="sx-ops-ghost h-10 w-[25rem] max-w-full rounded-md" />
          <div className="sx-ops-ghost h-9 w-40 rounded-md" />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="sx-ops-ghost h-9 w-64 max-w-full rounded-md" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="sx-ops-ghost hidden h-9 w-32 rounded-md sm:block" />
          ))}
        </div>
        <SkeletonRows />
      </div>
    </div>
  );
}
