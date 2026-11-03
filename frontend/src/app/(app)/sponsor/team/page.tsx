import { SponsorTeam } from "@/components/sponsor-team";
import { EmptyState } from "@/components/states";
import { StadiumHead, StadiumUpdated } from "@/components/stadium-stage";
import { type ApiSponsorTeam, type ApiTeamMember, MEMBER_STATUSES, TEAM_ROLES } from "@/lib/sponsor-team-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Sponsor Team — POL-FE-19, on the Stadium Board. "Team" under Account
   lands here: everyone on the sponsor's account, their role (Admin or
   Viewer), whether they have signed in yet, and the invite form.

   Reads  GET /sponsor/team   { sponsorName, members } — the whole team,
                              in the API's order (active first, admins
                              before viewers); never re-sorted here.

   Roles: SPONSOR_ADMIN only. The link is hidden from everyone else
   (lib/sponsor-nav.ts sponsorNavFor), and an analyst who types the URL —
   or a BTG preview — gets the not-in-your-role panel, from the roles here
   and again from the API's 403. The writes are team/actions.ts.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

type Live = { status: "ok"; team: ApiSponsorTeam } | { status: "forbidden" } | { status: "unavailable" };

function isMember(m: unknown): m is ApiTeamMember {
  const x = m as Partial<ApiTeamMember> | null;
  return !!x && typeof x.id === "string" && typeof x.email === "string"
    && (TEAM_ROLES as readonly string[]).includes(String(x.role))
    && (MEMBER_STATUSES as readonly string[]).includes(String(x.status))
    && typeof x.addedAt === "string";
}

async function liveTeam(): Promise<Live> {
  try {
    const res = await apiFetch("/sponsor/team");
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) return { status: "unavailable" };
    const body = (await res.json()) as Partial<ApiSponsorTeam> | null;
    const members = Array.isArray(body?.members) ? body.members.filter(isMember).map((m) => ({ ...m, you: m.you === true })) : [];
    return { status: "ok", team: { sponsorName: typeof body?.sponsorName === "string" ? body.sponsorName : "", members } };
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return { status: "unavailable" };
  }
}

function NotInRole({ roles }: { roles: readonly string[] }) {
  const who = roles.includes("SPONSOR_ANALYST") ? "a Sponsor Analyst (read only)" : "a BTG preview";
  return (
    <EmptyState
      mark="users"
      title="Not in your role"
      hint={`The Team page is for a Sponsor Admin. You're signed in as ${who}. If you need to manage who's on the account, ask an admin on your team to make you one.`}
      action={{ label: "Back to the Stadium Board", href: "/sponsor" }}
    />
  );
}

export default async function SponsorTeamPage() {
  const actor = await requirePortalAccess("sponsor");
  const now = new Date();
  const head = (sponsor?: string) => <StadiumHead title="Team" pill={<StadiumUpdated iso={now.toISOString()} />}>{sponsor ? <p className="text-xs text-muted">Who can sign in to {sponsor}&rsquo;s account, and as what.</p> : null}</StadiumHead>;

  /* The role is known before the read: an analyst never makes the call. */
  if (!actor.roles.includes("SPONSOR_ADMIN")) {
    return (
      <div className="space-y-6">
        {head()}
        <NotInRole roles={actor.roles} />
      </div>
    );
  }

  const live = await liveTeam();
  if (live.status === "forbidden") {
    /* An admin role the API still refuses. Two cases (QA pass 4, 2026-11-03):
       a login that carries SPONSOR_ADMIN but points at no sponsor account the
       API can find (its `sponsorId` is unset or dangling) is told that, not
       that it is "a BTG preview"; a preview without a sponsor keeps that copy. */
    if (actor.roles.includes("SPONSOR_ADMIN") && actor.sponsorId) {
      return (
        <div className="space-y-6">
          {head()}
          <EmptyState
            mark="users"
            title="This login isn't linked to a sponsor account"
            hint="You're a Sponsor Admin, but SponsorX can't find the sponsor account this login belongs to, so there's no team to show. Ask BTG to link it."
            action={{ label: "Back to the Stadium Board", href: "/sponsor" }}
          />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {head()}
        <NotInRole roles={actor.roles.filter((r) => r !== "SPONSOR_ADMIN")} />
      </div>
    );
  }
  if (live.status === "unavailable") {
    return (
      <div className="space-y-6">
        {head()}
        <EmptyState mark="users" title="Your team couldn't be read just now" hint="Nothing here has changed — refresh in a minute." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {head(live.team.sponsorName)}
      <SponsorTeam members={live.team.members} />
    </div>
  );
}
