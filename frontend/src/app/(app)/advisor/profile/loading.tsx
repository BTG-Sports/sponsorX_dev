import { SkeletonBlock } from "@/components/states";

/* The advisor Profile's loading screen (POL-FE-103): the page's own shape —
   the title and its line, the two cards, the school card and the two
   settings — so arriving never flashes a blank page. */
function CardGhost({ rows, button = true }: { rows: number; button?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <SkeletonBlock className="h-4 w-36" />
      <SkeletonBlock soft className="mt-2.5 h-3 w-64 max-w-full" />
      <div className="mt-4 space-y-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3">
            <SkeletonBlock soft className="h-3.5 w-16" />
            <SkeletonBlock className={`h-3.5 ${i % 2 ? "w-2/3" : "w-5/6"}`} />
          </div>
        ))}
      </div>
      {button && <SkeletonBlock className="mt-5 h-11 w-40 rounded-lg" />}
    </div>
  );
}

export default function Loading() {
  return (
    <div role="status" aria-label="Loading your profile" className="space-y-6">
      <div aria-hidden="true">
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock soft className="mt-2.5 h-3 w-80 max-w-full" />
      </div>
      <div aria-hidden="true" className="grid items-stretch gap-4 lg:grid-cols-2">
        <CardGhost rows={3} />
        <CardGhost rows={3} />
      </div>
      <div aria-hidden="true">
        <SkeletonBlock className="mb-3 h-4 w-28" />
        <CardGhost rows={5} button={false} />
      </div>
      <div aria-hidden="true" className="space-y-4">
        <SkeletonBlock className="h-4 w-56" />
        <CardGhost rows={1} />
        <CardGhost rows={2} />
      </div>
    </div>
  );
}
