import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { buildPropertyHome, type ApiMyProperty, type ApiRoster } from "@/lib/property-home-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Property portal home — P3-FE-07, §8. The manager's own organisation: its
   name, kind and place, its roster with the team's share of each athlete's
   earnings, and the inventory it offers sponsors. It replaced a sample
   property behind a demo banner (found by the staging walkthrough).

   Live only: GET /properties/mine (404 = this login has no property yet) and
   GET /team/roster (own property only; another property's rows are never
   reachable — scope.ts). Other failures throw to the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyHomePage() {
  await requirePortalAccess("property");

  const [mineRes, rosterRes] = await Promise.all([apiFetch("/properties/mine"), apiFetch("/team/roster")]);
  if (mineRes.status === 404) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Your property</h1>
        <EmptyState mark="users" title="No property is linked to this login yet" hint="Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!mineRes.ok) throw new Error(`Property unavailable (${mineRes.status}).`);
  if (!rosterRes.ok && rosterRes.status !== 403) throw new Error(`Roster unavailable (${rosterRes.status}).`);
  const p = buildPropertyHome(
    (await mineRes.json()) as ApiMyProperty,
    rosterRes.ok ? ((await rosterRes.json()) as ApiRoster) : null,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Monogram text={p.mono} tone="primary" className="size-12 text-sm" />
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {p.kind && <Badge tone="primary">{p.kind}</Badge>}
            {p.place}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-0.5 text-xs text-muted">Your organisation on SponsorX. Only you and BTG see this page.</p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:max-w-md">
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Roster</p>
          <p className="text-xl font-semibold tabular-nums">{p.athletes.length}</p>
          <p className="text-[11px] text-faint">athletes</p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Inventory</p>
          <p className="text-xl font-semibold tabular-nums">{p.inventory.length}</p>
          <p className="text-[11px] text-faint">items offered</p>
        </li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Roster" hint={`Athletes on ${p.name} and the team’s share of what they earn.`} />
          {p.athletes.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No athletes on your roster yet</p>
              <p className="mt-1 text-xs text-muted">Athletes appear here once BTG approves them with {p.name} as their team or school.</p>
            </Card>
          ) : (
            <Card className="p-0">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint">
                <span>Athlete</span>
                <span>Sport</span>
                <span className="text-right">Team share</span>
              </div>
              <ul className="divide-y divide-line-soft">
                {p.athletes.map((a) => (
                  <li key={a.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <Monogram text={a.mono} tone="accent" shape="circle" className="size-7 text-[10px]" />
                      <span className="truncate font-medium">{a.name}</span>
                    </span>
                    <span className="text-muted">{a.sport}</span>
                    <span className={`text-right tabular-nums ${a.shareSet ? "" : "text-warn"}`}>{a.share}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <SectionHeading title="Sponsorship inventory" hint={`What ${p.name} offers sponsors, at your price.`} />
          {p.inventory.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No inventory yet</p>
              <p className="mt-1 text-xs text-muted">Listing opens once BTG approves your onboarding. Signage, tickets and appearances all go here.</p>
            </Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {p.inventory.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.title}</span>
                      <span className="block text-[11px] text-muted">
                        {i.kind} · {i.qty}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{i.price}</span>
                      <Badge tone={i.status === "Active" ? "accent" : "neutral"}>{i.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
