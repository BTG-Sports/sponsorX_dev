import { SkeletonBlock } from "@/components/states";

import "@/app/brief/brief.css";

/* The builder's own shape while the catalogue and the countries are read:
   the top bar, the nine steps down the left from lg, a heading, two answer
   fields and the button (the house rule: a loader looks like the page it
   stands in for). */
export default function Loading() {
  return (
    <div className="sx-stage sx-brief relative flex min-h-svh flex-col overflow-x-clip" aria-busy="true">
      <span className="sr-only">Opening the campaign builder…</span>
      <div className="flex items-center justify-between px-5 py-4 sm:px-8 lg:px-10 lg:py-5">
        <SkeletonBlock className="h-8 w-28" />
        <SkeletonBlock soft className="h-4 w-28" />
      </div>
      <div className="bx-bar" />
      <div className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-10 xl:gap-20">
        <div className="hidden self-center pb-28 lg:block">
          <SkeletonBlock soft className="h-3 w-32" />
          <div className="mt-5 space-y-3.5">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center gap-3.5">
                <SkeletonBlock className="size-7 rounded-full" />
                <SkeletonBlock soft className="h-3.5 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col px-5 pb-10 pt-7 sm:px-8 lg:px-0 lg:pt-10">
          <SkeletonBlock soft className="h-3 w-40" />
          <SkeletonBlock className="mt-5 h-11 w-4/5 max-w-[480px]" />
          <SkeletonBlock soft className="mt-5 h-4 w-3/5 max-w-[420px]" />
          <div className="mt-10 max-w-[760px] space-y-9">
            <SkeletonBlock className="h-11" />
            <SkeletonBlock className="h-28" />
          </div>
          <SkeletonBlock className="mt-12 h-[52px] w-full rounded-[14px] sm:w-56" />
        </div>
      </div>
    </div>
  );
}
