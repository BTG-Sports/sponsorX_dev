import { SkeletonBlock } from "@/components/states";

/* The property Profile's loading screen (POL-FE-104): the page's own shape —
   the title and its line, the organisation card with its facts, and the four
   cards — so arriving never flashes a blank page (the portal's generic
   skeleton is a hero and stat tiles, which this page doesn't have). */
function CardGhost() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <SkeletonBlock className="h-4 w-36" />
      <SkeletonBlock soft className="mt-2.5 h-3 w-64 max-w-full" />
      <div className="mt-4 space-y-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3">
            <SkeletonBlock soft className="h-3.5 w-16" />
            <SkeletonBlock className={`h-3.5 ${i % 2 ? "w-2/3" : "w-5/6"}`} />
          </div>
        ))}
      </div>
      <SkeletonBlock className="mt-5 h-11 w-40 rounded-lg" />
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
      <div aria-hidden="true" className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-4">
            <SkeletonBlock className="size-16 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 basis-60 space-y-2.5">
              <SkeletonBlock soft className="h-3 w-16" />
              <SkeletonBlock className="h-6 w-56 max-w-full" />
              <SkeletonBlock soft className="h-3 w-32" />
            </div>
            <SkeletonBlock className="h-11 w-56 rounded-lg" />
          </div>
          <div className="mt-5 grid gap-x-8 gap-y-3.5 border-t border-line/60 pt-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3">
                <SkeletonBlock soft className="h-3.5 w-16" />
                <SkeletonBlock className={`h-3.5 ${i % 2 ? "w-1/2" : "w-3/4"}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <CardGhost />
          <CardGhost />
          <CardGhost />
          <CardGhost />
        </div>
      </div>
    </div>
  );
}
