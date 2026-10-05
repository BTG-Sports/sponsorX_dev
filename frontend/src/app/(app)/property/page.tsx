import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { buildPropertyHome, type ApiMyProperty, type ApiRoster } from "@/lib/property-home-live";
import { apiFetch } from "@/server/api";
import { PagerRow, ServerList } from "@/components/server-pager";
import { pageParams, pageParamsFor, type PageInfo, type SearchParams } from "@/lib/list-query";
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

const INV_KEYS = { page: "ipage", size: "isize" };

export default async function PropertyHomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePortalAccess("property");
  const sp = await searchParams;

  /* SERVER-PAGED (P2-FE-02, merged onto P3-FE-07): the roster and the
     inventory are one page each from GET /team/athletes and GET
     /team/inventory, with their DB counts — not /team/roster's every athlete
     with every item nested. The roster pages on ?page/?size, the inventory
     on ?ipage/?isize, so one never moves the other. */
  const a = pageParams(sp);
  const i = pageParamsFor(sp, INV_KEYS);
  const [mineRes, athRes, invRes] = await Promise.all([
    apiFetch("/properties/mine"),
    apiFetch(`/team/athletes?page=${a.page}&size=${a.size}`),
    apiFetch(`/team/inventory?page=${i.page}&size=${i.size}`),
  ]);
  if (mineRes.status === 404) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Your property</h1>
        <EmptyState mark="users" title="No property is linked to this login yet" hint="Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!mineRes.ok) throw new Error(`Property unavailable (${mineRes.status}).`);
  for (const r of [athRes, invRes]) if (!r.ok && r.status !== 403) throw new Error(`Roster unavailable (${r.status}).`);
  const mine = (await mineRes.json()) as ApiMyProperty;
  type AthPage = { property: ApiRoster["property"]; athletes: Omit<ApiRoster["athletes"][number], "inventory">[]; page: PageInfo; counts: { athletes: number; active: number } };
  type InvPage = { inventory: ApiRoster["inventory"]; page: PageInfo; counts: { items: number; active: number } };
  const ath = athRes.ok ? ((await athRes.json()) as AthPage) : null;
  const inv = invRes.ok ? ((await invRes.json()) as InvPage) : null;
  /* The builder's input shape, from the two pages (items carry no nesting). */
  const roster: ApiRoster | null = ath
    ? { property: ath.property, athletes: ath.athletes.map((x) => ({ ...x, inventory: [] })), inventory: inv?.inventory ?? [] }
    : null;
  const p = buildPropertyHome(mine, roster);
  const athleteTotal = ath?.counts.athletes ?? 0;
  const itemTotal = inv?.counts.items ?? 0;

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
          <p className="text-xl font-semibold tabular-nums">{athleteTotal}</p>
          <p className="text-[11px] text-faint">athletes</p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Inventory</p>
          <p className="text-xl font-semibold tabular-nums">{itemTotal}</p>
          <p className="text-[11px] text-faint">items offered</p>
        </li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Roster" hint={`Athletes on ${p.name} and the team’s share of what they earn.`} />
          {athleteTotal === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No athletes on your roster yet</p>
              <p className="mt-1 text-xs text-muted">Athletes appear here once they join {p.name}: approved with you as their team or school, or by accepting your invitation.</p>
            </Card>
          ) : (
            <ServerList>
            {ath && <PagerRow page={ath.page} noun="Athletes" tone="property" position="top" />}
            <div className="mt-3" />
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
            {ath && <PagerRow page={ath.page} noun="Athletes" tone="property" position="bottom" />}
            </ServerList>
          )}
        </section>

        <section>
          <SectionHeading title="Sponsorship inventory" hint={`What ${p.name} offers sponsors, at your price.`} />
          {itemTotal === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No inventory yet</p>
              <p className="mt-1 text-xs text-muted">Listing opens once your onboarding is approved. Signage, tickets and appearances all go here.</p>
            </Card>
          ) : (
            <ServerList>
            {inv && <PagerRow page={inv.page} noun="Items" tone="property" position="top" keys={INV_KEYS} />}
            <div className="mt-3" />
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
            {inv && <PagerRow page={inv.page} noun="Items" tone="property" position="bottom" keys={INV_KEYS} />}
            </ServerList>
          )}
        </section>
      </div>
    </div>
  );
}
