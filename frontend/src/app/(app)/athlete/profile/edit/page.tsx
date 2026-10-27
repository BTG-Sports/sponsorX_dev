import Link from "next/link";

import { ArenaHead, ArenaUpdated } from "@/components/arena-stage";
import { AthletePhotoEditor } from "@/components/athlete-photo-editor";
import { ProfileEditor } from "@/components/profile-editor";
import { BlockedNotice } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { LiveProfileEditor } from "@/components/live-profile-editor";
import { sectionStates, type ApiMyProfile } from "@/lib/profile-live";
import { isMinorNow, type ApiProfileChange } from "@/lib/profile-changes-live";
import type { SectionKey } from "@/lib/profile-sections";
import { apiFetch, fetchActor } from "@/server/api";

/** States in which an edit applies (P3-BE-16, 2S1-BE-14). Before approval
 *  the application itself is what the athlete edits, at /join. */
const POST_APPROVAL = ["APPROVED", "ACTIVE", "SUSPENDED"];

/* --------------------------------------------------------------------------
   Edit profile — §11 sections as an in-portal hub (2026-09-14).

   Prototype ahead of P3-BE-01/05 and P3-FE-03: the forms are real, the
   persistence isn't — edits live in this tab and the page says so.

   LIVE (P2-FE-01, then 2S1-FE-09). A signed-in athlete gets the live
   editor: every section as GET /athletes/me holds it, and every edit saves
   at once — socials (PUT /athletes/:id/socials) and the §11 sections
   (POST /athletes/:id/profile-changes, 2S1-BE-14). A legal name, date of
   birth or guardian is sensitive: BTG is told and the checks run again.
   Anyone else keeps the prototype.

   P1-ART-22 (2026-10-11) — the header is the Arena's: ArenaHead with the
   provenance pill, the one-line lede and the back link as a pill action.
   The LiveProfileEditor island is unchanged apart from its section card
   taking the plate skin; every read and write above is as it was.
   -------------------------------------------------------------------------- */

/** The back link, as the arena's secondary pill. */
function BackPill({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}

/** The athlete's own profile, or null for the prototype. No catch: an
 *  outage is an error page, never a sample profile shown as theirs. */
async function liveMe(): Promise<ApiMyProfile | "unlinked" | null> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.roles.includes("ATHLETE")) return null;
  const res = await apiFetch("/athletes/me");
  /* An ATHLETE role with no athlete record: BTG's fix, not an outage (F-3). */
  if (res.status === 403 || res.status === 404) return "unlinked";
  if (!res.ok) throw new Error(`Profile unavailable (${res.status}).`);
  return (await res.json()) as ApiMyProfile;
}

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
const list = (xs: string[]) => xs.map(words).join(", ");

function summaryOf(p: ApiMyProfile): Record<SectionKey, { label: string; value: string }[]> {
  return {
    identity: [
      { label: "Display name", value: p.displayName },
      { label: "Legal name", value: p.legalName },
      { label: "Region", value: [p.city, p.stateCode].filter(Boolean).join(", ") },
    ],
    sport: [
      { label: "Sport", value: p.sport },
      { label: "Position", value: p.position ?? "" },
      { label: "School / team", value: p.school ?? "" },
      { label: "Level", value: p.level ? words(p.level) : "" },
      { label: "Class of", value: p.gradYear ? String(p.gradYear) : "" },
    ],
    socials: [],
    capabilities: [{ label: "Jobs you'll deliver", value: p.contentCapabilities.join(", ") }],
    interests: [{ label: "Brand interests", value: list(p.brandInterests) }],
    restrictions: [
      { label: "Never promote", value: list(p.restrictedCategories) },
      { label: "Notes", value: p.restrictionNotes ?? "" },
    ],
    rates: [{ label: "Rates confirmed", value: String(p.ratesConfirmed) }],
    payment: [],
    agreements: [{ label: "Agreements accepted", value: String(p.agreementsSigned) }],
  };
}


export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const me = await liveMe();
  if (me === "unlinked") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ArenaHead title="Edit profile" actions={<BackPill href="/athlete">Back to your dashboard</BackPill>} />
        <div className="mt-4">
          <EmptyState
            mark="users"
            title="Your account isn't linked to an athlete profile yet"
            hint="Ask your BTG contact to connect this login to your athlete record, then your profile opens here."
          />
        </div>
      </div>
    );
  }
  if (me) {
    /* The athlete's own edits: a legal name waiting for its ID (banner,
       withdraw) and the last sensitive edits' checks. Same rule as the
       profile: an outage is an error, never a silently empty history. */
    const chRes = await apiFetch("/athletes/me/profile-changes");
    if (!chRes.ok) throw new Error(`Profile changes unavailable (${chRes.status}).`);
    const { changes } = (await chRes.json()) as { changes: ApiProfileChange[] };
    const editable = POST_APPROVAL.includes(me.state);
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ArenaHead
          title="Edit profile"
          pill={<ArenaUpdated />}
          actions={<BackPill href="/athlete/profile">Back to your profile</BackPill>}
        >
          <p className="sx-arena-in mt-3 max-w-2xl text-xs leading-relaxed text-muted" style={{ "--sx-reveal-delay": "0.1s" } as React.CSSProperties}>
            Nine sections make up your profile. Five are public, four stay
            between you and BTG — each one says which.
            {editable ? " Changes save straight away. A legal name, date of birth or guardian is sensitive: BTG is told and the checks run again." : ""}
          </p>
        </ArenaHead>
        {/* P8-FE-10 — the profile photo: on the public profile, and one of the
            fields the home page's Featured athletes panel needs. */}
        {editable && (
          <section aria-label="Profile photo" className="sx-arena-plate mt-4 px-4 py-4 pl-6">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Profile photo</h2>
            <AthletePhotoEditor
              athleteId={me.id}
              name={me.displayName}
              photoUrl={me.photoUrl ?? null}
              minor={isMinorNow(me.birthDate, me.ageBand)}
            />
          </section>
        )}
        <LiveProfileEditor
          athleteId={me.id}
          initialSection={section}
          states={sectionStates(me)}
          summary={summaryOf(me)}
          socials={me.socials}
          profile={{
            legalName: me.legalName, displayName: me.displayName, city: me.city, stateCode: me.stateCode,
            sport: me.sport, position: me.position, school: me.school, level: me.level, gradYear: me.gradYear, achievements: me.achievements,
            contentCapabilities: me.contentCapabilities, brandInterests: me.brandInterests,
            restrictedCategories: me.restrictedCategories, restrictionNotes: me.restrictionNotes,
            birthDate: me.birthDate ? me.birthDate.slice(0, 10) : null,
            minor: isMinorNow(me.birthDate, me.ageBand),
            guardian: me.guardian ? { legalName: me.guardian.legalName, confirmed: Boolean(me.guardian.verifiedAt) } : null,
          }}
          editable={editable}
          changes={changes}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ArenaHead
        title="Edit profile"
        lede="Nine sections make up your profile. Five are public, four stay between you and BTG — each one says which."
        actions={<BackPill href="/athlete/profile">Back to your profile</BackPill>}
      />

      <div className="sx-arena-plate mt-4 flex flex-wrap items-center gap-2 px-4 py-2.5 pl-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0 text-athlete"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 3M21 3l-4 1 1 4" />
        </svg>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          Signed-in athletes&rsquo; changes save straight away; a legal name, date
          of birth or guardian also tells BTG and re-runs the checks. In this
          prototype, edits live in this tab only.
        </p>
      </div>

      {/* P7-QA-02: the editor is seeded from fixtures (P3-FE-03 wires it) —
          the follower counts, rate card and completion % are a sample
          athlete's, and must not read as the signed-in athlete's own. */}
      <div className="mt-3">
        <BlockedNotice>
          Demo data — the values in this editor are a sample profile, not
          yours. Your real details are on Your profile.
        </BlockedNotice>
      </div>

      <div className="mt-6">
        <ProfileEditor initialSection={section} />
      </div>
    </div>
  );
}
