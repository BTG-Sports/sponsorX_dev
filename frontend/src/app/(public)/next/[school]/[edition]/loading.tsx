import { SkeletonBlock } from "@/components/states";

/* The digital edition while it loads (P9-FE-14): a skeleton in the reader's
   own shape — the cover beside the masthead, then "In this issue" with each
   piece's title lines and its picture, then the sponsors two across — so a
   reader on a phone sees a magazine arriving, not a blank page. */
export default function Loading() {
  return (
    <main role="status" aria-label="Loading the edition" className="relative">
      <div aria-hidden="true">
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-10 pt-14 sm:flex-row sm:items-end sm:gap-8">
            <SkeletonBlock className="aspect-[3/4] w-40 shrink-0 sm:w-44" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock soft className="h-2.5 w-52 max-w-full" />
              <SkeletonBlock className="mt-4 h-9 w-72 max-w-full" />
              <SkeletonBlock soft className="mt-3 h-3.5 w-56 max-w-full" />
              <div className="mt-4 flex flex-wrap gap-2">
                <SkeletonBlock soft className="h-5 w-20 rounded-full" />
                <SkeletonBlock soft className="h-5 w-36 rounded-full" />
                <SkeletonBlock soft className="h-5 w-48 max-w-full rounded-full" />
              </div>
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          <SkeletonBlock soft className="h-2.5 w-24" />
          <div className="mt-3 divide-y divide-line-soft rounded-xl border border-line bg-surface">
            {[true, false, true].map((pictured, i) => (
              <div key={i} className="px-4 py-4">
                <div className="flex gap-4">
                  <SkeletonBlock soft className="h-3 w-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock soft className="h-2.5 w-16" />
                    <SkeletonBlock className="mt-2 h-4 w-4/5" />
                    <SkeletonBlock soft className="mt-2 h-3 w-32" />
                  </div>
                </div>
                {pictured && <SkeletonBlock className="mt-3 aspect-video w-full" />}
              </div>
            ))}
          </div>
          <SkeletonBlock soft className="mt-10 h-2.5 w-32" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-[4.5rem]" />
            <SkeletonBlock className="h-[4.5rem]" />
          </div>
        </div>
      </div>
    </main>
  );
}
