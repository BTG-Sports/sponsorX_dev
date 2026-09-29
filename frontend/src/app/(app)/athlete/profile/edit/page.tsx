import { BackLink } from "@/components/back-link";
import { ProfileEditor } from "@/components/profile-editor";
import { BlockedNotice } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { LiveProfileEditor } from "@/components/live-profile-editor";
import { sectionStates, type ApiMyProfile } from "@/lib/profile-live";
import type { ApiProfileChange } from "@/lib/profile-changes-live";
import type { SectionKey } from "@/lib/profile-sections";
import { apiFetch, fetchActor } from "@/server/api";

/** States in which an edit is a change request (P3-BE-16). Before approval
 *  the application itself is what the athlete edits, at /join. */
const POST_APPROVAL = ["APPROVED", "ACTIVE", "SUSPENDED"];

/* --------------------------------------------------------------------------
   Edit profile — §11 sections as an in-portal hub (2026-09-14).

   Prototype ahead of P3-BE-01/05 and P3-FE-03: the forms are real, the
   persistence isn't — edits live in this tab and the page says so. The
   managed-marketplace framing (§10) is the important part to get right now:
   Save queues a change for BTG review, nothing claims to publish instantly.

   LIVE (P2-FE-01, scope decision 2026-09-29). A signed-in athlete gets the
   live editor: every section as GET /athletes/me holds it, social accounts
   editable (PUT /athletes/:id/socials), the rest changed through BTG until a
   post-approval edit endpoint exists. Anyone else keeps the prototype.
   -------------------------------------------------------------------------- */

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
        <BackLink target={{ href: "/athlete", label: "Back to your dashboard" }} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Edit profile</h1>
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
    /* P3-BE-16 — the athlete's own change requests: the open one (banner,
       withdraw) and the last decisions. Same rule as the profile: an outage
       is an error, never a silently empty history. */
    const chRes = await apiFetch("/athletes/me/profile-changes");
    if (!chRes.ok) throw new Error(`Profile changes unavailable (${chRes.status}).`);
    const { changes } = (await chRes.json()) as { changes: ApiProfileChange[] };
    const editable = POST_APPROVAL.includes(me.state);
    return (
      <div className="mx-auto w-full max-w-5xl">
        <BackLink target={{ href: "/athlete/profile", label: "Back to your profile" }} />
        <div className="mt-4">
          <h1 className="text-xl font-semibold tracking-tight">Edit profile</h1>
          <p className="mt-1 text-xs text-muted">
            Nine sections make up your profile. Five are public, four stay
            between you and BTG — each one says which.
            {editable ? " Social accounts save straight away; everything else goes to BTG for a quick review first." : ""}
          </p>
        </div>
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
          }}
          editable={editable}
          changes={changes}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink target={{ href: "/athlete/profile", label: "Back to your profile" }} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Edit profile</h1>
          <p className="mt-1 text-xs text-muted">
            Nine sections make up your profile. Five are public, four stay
            between you and BTG — each one says which.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-athlete/30 bg-athlete/8 px-3 py-2">
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
          Saved changes are reviewed by BTG before they appear publicly —
          usually within a business day. In this prototype, edits live in this
          tab only.
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
