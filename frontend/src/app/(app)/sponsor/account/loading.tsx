/* Sponsor Account's loading screen (POL-FE-102): the page's own shape on the
   Stadium Board — the title and its line, the company header, the four
   cards and the notifications — so arriving never flashes a blank board. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading your account" className="space-y-6">
      <div aria-hidden="true">
        <div className="sx-stadium-ghost h-7 w-36 rounded-md" />
        <div className="sx-stadium-ghost mt-3 h-3.5 w-[26rem] max-w-full rounded" />
      </div>
      <div aria-hidden="true" className="space-y-4">
        <div className="sx-stadium-panel flex flex-wrap items-center gap-4 p-5">
          <div className="sx-stadium-ghost size-16 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 basis-60 space-y-2.5">
            <div className="sx-stadium-ghost h-3 w-20 rounded" />
            <div className="sx-stadium-ghost h-6 w-56 max-w-full rounded-md" />
            <div className="flex gap-1.5">
              <div className="sx-stadium-ghost h-5 w-20 rounded-full" />
              <div className="sx-stadium-ghost h-5 w-24 rounded-full" />
            </div>
          </div>
          <div className="sx-stadium-ghost h-11 w-52 rounded-lg" />
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sx-stadium-panel space-y-3 p-5">
              <div className="sx-stadium-ghost h-4 w-40 rounded" />
              <div className="sx-stadium-ghost h-3 w-64 max-w-full rounded" />
              <div className="sx-stadium-ghost h-3.5 w-full rounded" />
              <div className="sx-stadium-ghost h-3.5 w-5/6 rounded" />
              <div className="sx-stadium-ghost h-3.5 w-2/3 rounded" />
              <div className="sx-stadium-ghost h-11 w-44 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="sx-stadium-panel space-y-3 p-5">
          <div className="sx-stadium-ghost h-4 w-36 rounded" />
          <div className="sx-stadium-ghost h-10 w-full rounded-lg" />
          <div className="sx-stadium-ghost h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
