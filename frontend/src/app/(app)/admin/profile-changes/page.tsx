import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ListFilter, PagerRow, ServerList } from "@/components/server-pager";
import { ProfileChangeActions } from "@/components/profile-change-actions";
import { pageParams, textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import {
  SECTION_LABELS,
  STATE_COPY,
  diffRows,
  touchesRestrictions,
  waitHours,
  type ApiDeskChange,
  type ProfileChangeState,
} from "@/lib/profile-changes-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Profile changes — P3-BE-16, §11, §24, §26. The Athlete Network Manager's
   second desk, beside Applications: what approved athletes want to change
   about themselves, waiting for a yes or a no.

   No demo mode. This desk exists only because the API holds real requests;
   a sample queue would teach nothing. Signed-in staff outside the role get
   "not in your role" (C-1); anyone else is told to sign in.

   SERVER-PAGED: ?page ?size ?state → GET /profile-changes?page=, one page
   with the athlete's current values for every proposed field, so each row
   shows "now → proposed" without a second read. Pending is oldest-first —
   the queue's fairness — and the hero's count is the database's.
   -------------------------------------------------------------------------- */

const STATES: ProfileChangeState[] = ["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"];
const AGING_HOURS = 48;

export default async function ProfileChangesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lacking = await staffWithoutAccess("/admin/profile-changes");
  if (lacking) return <NotInRole path="/admin/profile-changes" title="Profile changes" roles={lacking} />;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Profile changes</h1>
      <p className="mt-1 text-xs text-muted">
        What approved athletes want to change about their profile. Nothing moves until you approve it — the public page, matching and the conflict check all read the profile as it stands.
      </p>
    </div>
  );

  const who = await fetchActor();
  if (who.status !== "linked") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="users" title="Sign in to review" hint="This desk reads the live queue for BTG admins and network managers." action={{ label: "Back to the Operations Board", href: "/admin" }} />
      </div>
    );
  }

  const sp = await searchParams;
  const p = pageParams(sp);
  const stateParam = textParam(sp, "state");
  const state = STATES.includes(stateParam as ProfileChangeState) ? (stateParam as ProfileChangeState) : "";
  const states = state ? [state] : STATES;
  const res = await apiFetch(`/profile-changes?page=${p.page}&size=${p.size}&state=${states.join(",")}`);
  if (!res.ok) throw new Error(`Profile changes unavailable (${res.status}).`);
  const data = (await res.json()) as { changes: ApiDeskChange[]; page: PageInfo; counts: { pending: number } };
  const now = new Date();
  const aged = data.changes.filter((c) => c.state === "PENDING" && waitHours(c.createdAt, now) > AGING_HOURS).length;

  return (
    <div className="space-y-6">
      {heading}

      <HeroBand border="border-admin/25" className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Review queue</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
            {data.counts.pending}
          </span>
          <span className="text-sm text-muted">{data.counts.pending === 1 ? "change" : "changes"} waiting</span>
          <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
        <p className="mt-3 text-xs text-muted">
          {aged > 0 ? (
            <>
              <strong className="font-semibold text-text">{aged}</strong> on this page waiting over {AGING_HOURS} hours
            </>
          ) : (
            "Athletes hear back by email the moment you decide."
          )}
        </p>
      </HeroBand>

      <section className="sx-animate sx-delay-1 space-y-3">
        <SectionHeading title="The queue" hint="Each row shows the profile as it stands and what the athlete proposes." />
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter
            param="state"
            value={state}
            label="Show"
            allLabel="All"
            options={STATES.map((s) => ({ value: s, label: STATE_COPY[s].label }))}
            tone="admin"
          />
        </div>

        {data.page.total === 0 ? (
          <EmptyState
            mark="inbox"
            title={state === "PENDING" || !state ? "Nothing waiting" : `No ${STATE_COPY[state].label.toLowerCase()} changes`}
            hint="Approved athletes send changes from Edit profile in their portal; they land here."
            action={{ label: "Athlete applications", href: "/admin/applications" }}
          />
        ) : (
          <ServerList>
            <PagerRow page={data.page} noun="Changes" tone="admin" position="top" filtered={Boolean(state)} />
            <ul className="mt-3 space-y-3">
              {data.changes.map((c) => {
                const rows = diffRows(c, c.current);
                const hours = waitHours(c.createdAt, now);
                return (
                  <li key={c.id}>
                    <Card className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{c.athlete.displayName}</span>
                            <span className="text-[11px] text-muted">{c.athlete.legalName}</span>
                            <Badge tone={STATE_COPY[c.state].tone}>{STATE_COPY[c.state].label}</Badge>
                            {touchesRestrictions(c) && <Badge tone="danger">Restrictions · §26</Badge>}
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            {c.sections.map((s) => SECTION_LABELS[s] ?? s).join(" · ")} · sent {hours < 1 ? "just now" : `${hours}h ago`}
                            {c.state === "PENDING" && hours > AGING_HOURS && <span className="text-warn"> · waiting over {AGING_HOURS}h</span>}
                          </p>
                        </div>
                        <Link href="/admin/network" className="text-[11px] font-medium text-accent hover:text-accent-soft">
                          Network →
                        </Link>
                      </div>

                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-faint">
                            <th className="py-1 text-left font-medium">Field</th>
                            <th className="py-1 text-left font-medium">Now</th>
                            <th className="py-1 text-left font-medium">Proposed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {rows.map((r) => (
                            <tr key={r.field} className="align-top">
                              <td className="py-1.5 pr-3 text-muted">{r.label}</td>
                              <td className="py-1.5 pr-3 break-words text-muted line-through decoration-line/60">{r.before}</td>
                              <td className="py-1.5 break-words font-medium text-text">{r.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {c.note && (
                        <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
                          <span className="font-medium text-text">From the athlete:</span> {c.note}
                        </p>
                      )}
                      {c.reviewerNotes && c.state !== "PENDING" && (
                        <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
                          <span className="font-medium text-text">Reviewer notes:</span> {c.reviewerNotes}
                        </p>
                      )}
                      {c.state === "PENDING" && <ProfileChangeActions id={c.id} />}
                    </Card>
                  </li>
                );
              })}
            </ul>
            <PagerRow page={data.page} noun="Changes" tone="admin" position="bottom" filtered={Boolean(state)} />
          </ServerList>
        )}
      </section>

      <p className="sx-animate sx-delay-2 text-[10px] leading-relaxed text-faint">
        Approving writes the fields to the athlete&rsquo;s record in one step and is audited; a restriction change is audited on its own, because the conflict check reads it.
      </p>
    </div>
  );
}
