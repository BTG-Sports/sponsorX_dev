import type { Engine } from "@/lib/intelligence";
import { Card } from "./ui";

/* --------------------------------------------------------------------------
   "This engine isn't built yet" — every Phase 3 screen's honest empty state
   (lib/intelligence.ts). Theme tokens only, like EmptyState, so it takes on
   whichever stage it sits in: Mission Control, the Stadium Board, the
   property portal.

   Staff see which tasks it waits on and the route it will read — the
   information that tells them who to ask. A sponsor or a property sees one
   plain sentence and the list of what will appear: no task ids, no routes.
   Never a number, never a sample figure.
   -------------------------------------------------------------------------- */

export function EnginePending({ engine, audience = "staff" }: { engine: Engine; audience?: "staff" | "sponsor" | "property" }) {
  const staff = audience === "staff";
  return (
    <div data-engine-pending={engine.key}>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warn" />
            {staff ? "Engine not live yet" : "Coming soon"}
          </span>
          {staff && <span className="text-[11px] text-faint">{engine.screen} · {engine.name}</span>}
        </div>

        <p className="max-w-2xl text-sm">
          {staff
            ? "No figures are shown until the engine answers. A placeholder number would be a statistic nobody can trace."
            : engine.plain}
        </p>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">What will appear here</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
            {engine.shows.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {staff && (
          <div className="grid gap-3 border-t border-line pt-3 text-xs sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Waits on</p>
              <ul className="mt-1.5 space-y-1 text-muted">
                {engine.waitsOn.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Reads</p>
              <code className="mt-1.5 inline-block rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">/api/v1{engine.endpoint.replace(/^[A-Z]+ /, "")}</code>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Above any `?demo=sample` content (server/engine.ts `wantsSample`). */
export function SampleBanner() {
  return (
    <p role="note" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
      Sample data — a development preview of this screen&rsquo;s live layout. Not from any engine; never shown in production.
    </p>
  );
}
