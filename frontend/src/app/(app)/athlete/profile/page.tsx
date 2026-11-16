import Link from "next/link";
import { ArenaChip, ArenaHead, ArenaUpdated, ArenaTile, ArenaTiles, at } from "@/components/arena-stage";
import { AthleteProfileView } from "@/components/athlete-profile-view";
import { ProfileShowcase } from "@/components/profile-showcase";
import { ProfileWizard } from "@/components/profile-wizard";
import { BlockedNotice } from "@/components/ui";
import { athlete, athletePublic, profileChecklist } from "@/lib/fixtures";
import { CHECKLIST_SECTION } from "@/lib/profile-sections";
import { sectionStates, type ApiMyProfile, type ApiRate } from "@/lib/profile-live";
import { isMinorNow } from "@/lib/profile-changes-live";
import { profileComplete, publicFace, wizardDone } from "@/lib/profile-wizard";
import { apiFetch, fetchActor } from "@/server/api";
import { viewerIsAthlete } from "@/lib/athlete-order-pause";

/* The wizard's stepper, panels, medal and buttons are the confirmations
   wizard's (POL-FE-79); the profile's own pieces are in profile.css. */
import "../confirmations/confirmations.css";
import "./profile.css";

/* --------------------------------------------------------------------------
   Your public profile — inside the Athlete Portal (2026-09-14 UX pass).

   The sidebar's "Public profile" used to link straight to /athletes/[slug],
   throwing the athlete out of their portal into the public site. This page
   keeps them home, framed for its owner (memory: portal-views-stay-in-
   portal). Stale ?from=athlete-portal links to the public page redirect here.

   LIVE vs DEMO (P3-FE-03, the review-queue precedent). A signed-in ATHLETE
   (or a guardian acting for their minor) sees their REAL profile — GET
   /athletes/me and their own /rates. Anyone else keeps the fixture demo.

   POL-FE-80 (2026-11-16) — redesigned as a wizard. The owner found the
   nine-plate dashboard (P1-ART-22) "so confusing for a human":
     · Unfinished profile → a step-by-step wizard, one step per section the
       athlete can answer (components/profile-wizard.tsx), with a live
       preview of the public page. Each save is the full editor's own write.
       While it's on there is no "Full editor" button (owner, POL-FE-81), and
       the home's "Finish profile" opens this page, not the editor.
     · Finished profile → no wizard and no "Open public page" link: the
       public page itself, owner-framed (components/profile-showcase.tsx),
       with the private sections under it.
   "Finished" is the §24 meter at 100% (lib/profile-wizard.ts), derived from
   the same read; nothing is invented.
   -------------------------------------------------------------------------- */

/** The real profile for a signed-in athlete, or null for the fixture demo. */
async function liveProfile(): Promise<{ p: ApiMyProfile; rates: ApiRate[] } | null> {
  /* No catch: an API outage lands on the error boundary, never on fixtures
     presented as the athlete's own profile (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!viewerIsAthlete(who.actor) /* POL-FE-55 (app review B4): a guardian acting for a minor too */) return null;

  const res = await apiFetch("/athletes/me");
  /* A 403 here is an athlete role with no athlete row — a provisioning gap,
     not an outage. The demo would be a lie either way; say so. */
  if (!res.ok) throw new Error(`Profile unavailable (${res.status}).`);
  const p = (await res.json()) as ApiMyProfile;

  /* The athlete's own card (P3-FE-04) — own-scoped at the API, so this is
     exactly one athlete's pay and can be nobody else's. */
  const ratesRes = await apiFetch(`/athletes/${encodeURIComponent(p.id)}/rates`);
  if (!ratesRes.ok) throw new Error(`Rate card unavailable (${ratesRes.status}).`);
  const { rates } = (await ratesRes.json()) as { rates: ApiRate[] };
  return { p, rates };
}

/* The owner actions, as the arena's pills (globals.css skins both). */
const PILL_PRIMARY =
  "sx-btn-primary inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-cta-ink outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const PILL_SECONDARY =
  "sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/** Humanize a stored enum-ish token: "HIGH_SCHOOL" → "High school". */
function words(s: string): string {
  return (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </svg>
  );
}

function OutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-9 9M9 5H5v14h14v-4" />
    </svg>
  );
}

function EditPill({ label = "Edit profile", quiet = false }: { label?: string; quiet?: boolean }) {
  return (
    <Link href="/athlete/profile/edit" className={quiet ? PILL_SECONDARY : PILL_PRIMARY}>
      <PencilIcon />
      {label}
    </Link>
  );
}

/** The real public page, in a new tab — only while the profile is
 *  unfinished; a finished profile shows the page itself, here. */
function PublicPill({ slug }: { slug: string }) {
  return (
    <a href={`/athletes/${encodeURIComponent(slug)}?from=athlete-profile`} target="_blank" rel="noreferrer" className={PILL_SECONDARY}>
      Open public page
      <OutIcon />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** States in which an edit applies (P3-BE-16, 2S1-BE-14). Before approval
 *  the application itself is what the athlete edits, at /join. */
const POST_APPROVAL = ["APPROVED", "ACTIVE", "SUSPENDED"];

function LiveProfile({ p, rates }: { p: ApiMyProfile; rates: ApiRate[] }) {
  const states = sectionStates(p);
  const complete = profileComplete(states);
  const isActive = p.state === "ACTIVE";
  const lede = [p.displayName, p.sport, p.school].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <ArenaHead
        title="Public profile"
        pill={<ArenaUpdated />}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <span>{lede}</span>
            <ArenaChip tone={isActive ? "win" : "ink"}>{words(p.state)}</ArenaChip>
          </span>
        }
        actions={
          /* POL-FE-81 (owner, 2026-11-16): while the wizard is on, it is the
             one way to fill the profile in, so no "Full editor" beside it.
             Only the identity step still links to the editor, for the
             legal name and naming a guardian, which the wizard can't do. */
          complete ? <EditPill /> : isActive ? <PublicPill slug={p.slug} /> : null
        }
      />

      <ProfileWizard
        profile={p}
        done={wizardDone(states)}
        complete={complete}
        editable={POST_APPROVAL.includes(p.state)}
        minor={isMinorNow(p.birthDate, p.ageBand)}
      >
        <ProfileShowcase
          face={publicFace(p)}
          slug={p.slug}
          live={isActive}
          priv={{
            restrictedCategories: p.restrictedCategories,
            restrictionNotes: p.restrictionNotes,
            rates,
            tier: p.tier,
            agreementsSigned: p.agreementsSigned,
          }}
        />
      </ProfileWizard>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  const live = await liveProfile();
  if (live) return <LiveProfile p={live.p} rates={live.rates} />;

  const missing = profileChecklist.filter((c) => !c.done);
  const done = profileChecklist.length - missing.length;

  return (
    <div className="space-y-6">
      {/* C-2 (check pass): only a signed-in non-athlete — a guardian, or
          staff previewing — reaches this fixture view; it must never read as
          their own profile. */}
      <BlockedNotice>
        Sample profile, not a real one. Only the athlete sees their own
        profile here.
      </BlockedNotice>

      <ArenaHead
        title="Public profile"
        lede={`${athletePublic.name} · ${athletePublic.sport} · ${athletePublic.position}`}
        actions={
          <>
            <PublicPill slug={athletePublic.slug} />
            <EditPill />
          </>
        }
      >
        <ArenaTiles cols={2}>
          {/* A stronger profile earns better matches (§11) — the one owner
              figure that belongs on this screen. The checklist itself lives
              on the dashboard. */}
          <ArenaTile
            label="Profile completion"
            value={athlete.profileCompletion}
            format="pct"
            share={athlete.profileCompletion / 100}
            tone={athlete.profileCompletion === 100 ? "win" : "blue"}
            caption={missing.length > 0 ? `finish ${missing.map((c) => c.label.toLowerCase()).join(", ")}` : "every section is filled in"}
            href={missing.length > 0 ? `/athlete/profile/edit?section=${CHECKLIST_SECTION[missing[0].label]}` : "/athlete/profile/edit"}
            delay={0.1}
          />
          <ArenaTile
            label="Sections done"
            value={done}
            caption={`of ${profileChecklist.length} on the checklist`}
            tone={done === profileChecklist.length ? "win" : "ink"}
            delay={0.16}
          />
        </ArenaTiles>
      </ArenaHead>

      <div className="sx-arena-in" style={at(0.3)}>
        <AthleteProfileView variant="owner" initialTab={tab} />
      </div>
    </div>
  );
}
