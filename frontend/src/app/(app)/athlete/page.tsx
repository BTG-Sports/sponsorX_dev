import Link from "next/link";

import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram } from "@/components/hero";
import { DUE_STATES, buildHome } from "@/lib/athlete-home-live";
import { EmptyState } from "@/components/states";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import type { ApiEarning, ApiEarningsSummary } from "@/lib/earnings-live";
import type { ApiInvitation } from "@/lib/invitations-live";
import type { ApiMyProfile } from "@/lib/profile-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Athlete portal home — P3-FE-06, §9 screen 6. The signed-in athlete's own
   summary: status, profile completion, open invitations, deliverables due
   and earnings by status, each linking to its full page. It replaced a
   sample athlete behind a demo banner (found by the staging walkthrough).

   Live only. A guardian also opens this portal: they have no athlete row, so
   no profile block, but the invitation, deliverable and earning reads are
   ward-scoped for them and show here. A non-OK read throws to the error page;
   it never falls back to sample figures.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function read<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

export default async function AthleteHomePage() {
  const actor = await requirePortalAccess("athlete");
  const isAthlete = actor.roles.includes("ATHLETE");

  /* SERVER-PAGED (P2-FE-02): the home shows three of each, so it asks for
     three — the soonest-expiring open invites and the soonest-due
     deliverables — with the true counts from the inbox summary and
     `page.total`, and the money from the earnings summary. Nothing here
     reads a whole list. */
  const [me, inv, inbox, del, earnSummary] = await Promise.all([
    isAthlete ? apiFetch("/athletes/me") : Promise.resolve(null),
    read<{ invitations: ApiInvitation[] }>("/invitations?page=1&size=3&state=open&sort=expiry"),
    read<{ summary: { open: number } }>("/invitations/summary"),
    read<{ deliverables: ApiDeliverable[]; page: { total: number } }>(`/deliverables?page=1&size=3&state=${DUE_STATES.join(",")}&sort=due`),
    read<ApiEarningsSummary>(`/earnings/summary?year=${new Date().getUTCFullYear()}`),
  ]);
  /* F-3: an ATHLETE role with no athlete record behind it is a provisioning
     gap BTG fixes, not an outage — say so instead of the error page. */
  if (me && (me.status === 403 || me.status === 404)) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Your dashboard</h1>
        <EmptyState
          mark="users"
          title="Your account isn't linked to an athlete profile yet"
          hint="You're signed in, but BTG hasn't connected this login to your athlete record. Ask your BTG contact to link it — nothing is lost in the meantime."
          action={{ label: "How athletes join", href: "/join" }}
        />
      </div>
    );
  }
  if (me && !me.ok) throw new Error(`/athletes/me unavailable (${me.status}).`);
  const profile = me ? ((await me.json()) as ApiMyProfile) : null;
  const h = buildHome({
    profile,
    invitations: inv.invitations,
    deliverables: del.deliverables,
    earnings: [] as ApiEarning[],
    now: new Date(),
    counts: { invites: inbox.summary.open, due: del.page.total },
    earningsSummary: earnSummary,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Your dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{h.firstName ? `Hi, ${h.firstName}` : "Hi there"}</h1>
          {h.subtitle && <p className="mt-1 text-xs text-muted">{h.subtitle}</p>}
          {!isAthlete && <p className="mt-1 text-xs text-muted">You’re signed in as a guardian — this is your athlete’s work.</p>}
        </div>
        {h.status && (
          <div className="max-w-xs text-right">
            <Badge tone={h.status.tone}>{h.status.label}</Badge>
            {h.status.line && <p className="mt-1 text-[11px] text-muted">{h.status.line}</p>}
          </div>
        )}
      </div>

      {h.profile && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">Profile completion</p>
              <p className="text-2xl font-semibold tabular-nums">{h.profile.percent}%</p>
            </div>
            <Link href="/athlete/profile/edit" className="text-xs font-semibold text-primary hover:underline">
              Finish profile →
            </Link>
          </div>
          <div
            role="progressbar"
            aria-label="Profile completion"
            aria-valuenow={h.profile.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${h.profile.percent}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {h.profile.done} of {h.profile.total} sections done
            {h.profile.missing.length > 0 && ` · still missing: ${h.profile.missing.join(", ")}`}
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading
            title={`Open invitations · ${h.inviteCount}`}
            action={<Link href="/athlete/invitations" className="text-xs text-primary hover:underline">All invitations →</Link>}
          />
          {h.invites.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No invitations yet</p>
              <p className="mt-1 text-xs text-muted">BTG invites you to campaigns once your profile is live. A complete profile gets matched sooner.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {h.invites.map((i) => (
                <li key={i.id}>
                  <Link href="/athlete/invitations" className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                    <Monogram text={i.mono} tone="accent" className="size-9 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{i.sponsor}</span>
                      <span className="block truncate text-[11px] text-muted">{i.campaign}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{i.offer}</span>
                      <span className={`block text-[11px] ${i.urgent ? "text-warn" : "text-muted"}`}>{i.expires}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading
            title={`Deliverables due · ${h.dueCount}`}
            action={<Link href="/athlete/deliverables" className="text-xs text-primary hover:underline">All deliverables →</Link>}
          />
          {h.deliverables.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">Nothing due</p>
              <p className="mt-1 text-xs text-muted">Deliverables show up here after you accept an invitation.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {h.deliverables.map((d) => (
                <li key={d.id}>
                  <Link href={`/athlete/deliverables/${encodeURIComponent(d.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                    <span className="grid w-10 shrink-0 text-center">
                      <span className="text-[10px] font-medium text-muted">{d.mon}</span>
                      <span className="text-lg font-semibold tabular-nums">{d.day}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{d.title}</span>
                      <span className={`block truncate text-[11px] ${d.overdue ? "text-warn" : "text-muted"}`}>
                        {d.campaign} · {d.due}
                      </span>
                    </span>
                    <Badge tone={d.review === "Not started" ? "neutral" : "primary"}>{d.review}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <SectionHeading
          title="Earnings"
          hint={h.hasEarnings ? "By status, from your Campaign Orders." : "Earnings appear once you accept a Campaign Order."}
          action={<Link href="/athlete/earnings" className="text-xs text-primary hover:underline">Earnings →</Link>}
        />
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {h.earnings.map((e) => (
            <li key={e.label} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-muted">{e.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${e.tone === "accent" ? "text-accent" : ""}`}>{e.amount}</p>
              <p className="mt-0.5 text-[11px] text-faint">{e.hint}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
