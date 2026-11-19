import { SkeletonBlock } from "@/components/states";

/* The application's own shape while the agreement and the rules wording are
   read: the top bar, the steps down the left from lg, a heading, a few
   answer lines and the button (the house rule: a loader looks like the page
   it stands in for). */
export default function Loading() {
  return (
    <div data-tone="athlete" className="sx-stage sx-brief relative flex min-h-svh flex-col overflow-x-clip" aria-busy="true">
      <span className="sr-only">Loading the application…</span>
      <div className="flex items-center justify-between px-5 py-4 sm:px-8 lg:px-10 lg:py-5">
        <SkeletonBlock className="h-8 w-28" />
        <SkeletonBlock soft className="h-4 w-36" />
      </div>
      <div className="bx-bar" />
      <div className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-10 xl:gap-20">
        <div className="hidden self-center pb-28 lg:block">
          <SkeletonBlock soft className="h-3 w-32" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center gap-3.5">
                <SkeletonBlock className="size-7 rounded-full" />
                <SkeletonBlock soft className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col px-5 pb-10 pt-7 sm:px-8 lg:justify-center lg:px-0">
          <SkeletonBlock soft className="h-3 w-40" />
          <SkeletonBlock className="mt-5 h-12 w-4/5 max-w-[520px]" />
          <SkeletonBlock soft className="mt-5 h-4 w-3/5 max-w-[420px]" />
          <div className="mt-10 grid max-w-[760px] grid-cols-2 gap-x-10 gap-y-9">
            <SkeletonBlock className="h-11" />
            <SkeletonBlock className="h-11" />
            <SkeletonBlock className="col-span-2 h-11" />
            <SkeletonBlock className="col-span-2 h-11" />
          </div>
          <SkeletonBlock className="mt-12 h-[52px] w-56 rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}
