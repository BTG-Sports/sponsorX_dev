import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { PropertyRosterAdd, PropertyShareEdit } from "@/components/property-roster";
import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";
import { ATHLETE_STATES, ATHLETE_STATE_OPTIONS, rosterRow, type ApiAthletesPage } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Roster — 2S2-FE-04 (Team dashboard, design Team.dc.html). The manager's
   athletes, each one's state, and the team's share of what they earn.

   Reads  GET  /team/athletes?page&size&q&state=   one page + counts
   Writes POST /team/roster                        add an athlete (409 when
                                                   the email has an account)
          PATCH /team/roster/:athleteId            { teamShareBps | null }

   PROPERTY_MGR only (teamMember own-property); a 403 is a login with no
   property linked, shown as such. Honest gaps, left out on purpose: no
   per-athlete revenue exists (the design's "Earned" column), no remove-
   from-roster route, no campaigns list for a property, and no "tasks for
   you" feed — none is shown or faked.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyRosterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("property");
  const sp = await searchParams;
  const q = textParam(sp, "q");
  const state = textParam(sp, "state", ATHLETE_STATES);

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Roster</h1>
      <p className="mt-1 text-xs text-muted">Your athletes, where each one stands, and the team&rsquo;s share of what they earn.</p>
    </div>
  );

  const res = await apiFetch(`/team/athletes${apiListQuery(sp, { q, state })}`);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="users" title="No property is linked to this login" hint="The roster belongs to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Roster unavailable (${res.status}).`);
  const data = (await res.json()) as ApiAthletesPage;
  const rows = data.athletes.map(rosterRow);
  const filtered = !!(q || state);

  return (
    <div className="space-y-6">
      {heading}

      <ul className="grid grid-cols-2 gap-3 sm:max-w-md">
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">On the roster</p>
          <p className="text-xl font-semibold tabular-nums">{data.counts.athletes}</p>
          <p className="text-[11px] text-faint">athletes</p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Active</p>
          <p className="text-xl font-semibold tabular-nums">{data.counts.active}</p>
          <p className="text-[11px] text-faint">live or featured profiles</p>
        </li>
      </ul>

      <PropertyRosterAdd teamName={data.property.name} />

      <section>
        <SectionHeading title="Athletes" hint="Click a team share to change it. It applies to what the athlete earns from here on." />
        {data.counts.athletes === 0 ? (
          <EmptyState mark="users" title="No athletes on your roster yet" hint="Add your athletes. Each one sets up their own profile; you set the team’s share of what they earn." />
        ) : (
          <ServerList>
            <div className="flex flex-wrap items-end gap-3">
              <ListSearch initial={q} label="Search athletes" placeholder="Search by name" tone="property" />
              <ListFilter param="state" value={state} label="State" allLabel="Every state" options={ATHLETE_STATE_OPTIONS} tone="property" />
            </div>
            <div className="mt-3" />
            <PagerRow page={data.page} noun="Athletes" tone="property" position="top" filtered={filtered} />
            <div className="mt-3" />
            <PendingList>
              {rows.length === 0 ? (
                <Card>
                  <p className="text-sm font-semibold">No athletes match</p>
                  <p className="mt-1 text-xs text-muted">Clear the search or the state filter to see the whole roster.</p>
                </Card>
              ) : (
                <Card className="p-0">
                  <div className="grid grid-cols-[1fr_7.5rem_7.5rem] gap-x-4 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint">
                    <span>Athlete</span>
                    <span>State</span>
                    <span className="text-right">Team share</span>
                  </div>
                  <ul className="divide-y divide-line-soft">
                    {rows.map((a) => (
                      <li key={a.id} className="grid grid-cols-[1fr_7.5rem_7.5rem] items-center gap-x-4 px-4 py-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <Monogram text={initials(a.name)} tone="accent" shape="circle" className="size-7 text-[10px]" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.name}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {[a.sport, a.detail, a.legalName ? `Legal name ${a.legalName}` : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </span>
                        <span>
                          <Badge tone={a.stateTone}>{a.stateLabel}</Badge>
                        </span>
                        <span className="text-right">
                          <PropertyShareEdit athleteId={a.id} name={a.name} bps={a.shareBps} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </PendingList>
            <PagerRow page={data.page} noun="Athletes" tone="property" position="bottom" />
          </ServerList>
        )}
      </section>

      <p className="text-[11px] text-faint">
        Earnings per athlete aren&rsquo;t shown here yet — the ledger records the team&rsquo;s own share only. See Earnings for that.
      </p>
    </div>
  );
}
