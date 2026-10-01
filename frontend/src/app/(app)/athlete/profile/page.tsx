import Link from "next/link";
import { AthleteProfileView } from "@/components/athlete-profile-view";
import { Badge, BlockedNotice, Card, Meter, SourceLabel } from "@/components/ui";
import { athlete, athletePublic, profileChecklist } from "@/lib/fixtures";
import { CHECKLIST_SECTION, SECTIONS, type SectionKey } from "@/lib/profile-sections";
import {
  completion,
  sectionStates,
  type ApiMyProfile,
  type ApiRate,
  type SectionState,
} from "@/lib/profile-live";
import { money } from "@/lib/fixtures";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Your public profile — inside the Athlete Portal (2026-09-14 UX pass).

   The sidebar's "Public profile" used to link straight to /athletes/[slug],
   throwing the athlete out of their portal into the public site. This page
   keeps them home: the same profile content, framed for its owner — no
   Follow / Request Partnership aimed at yourself (AthleteProfileView's
   "owner" variant swaps those for pointers to Invitations), a completion
   nudge, and the real public URL one labelled new-tab link away. Stale
   ?from=athlete-portal links to the public page redirect here.

   LIVE vs DEMO (P3-FE-03, the review-queue precedent). A signed-in ATHLETE
   sees their REAL profile — GET /athletes/me — and a §24 completion meter
   DERIVED from the data (lib/profile-live.ts), section by §11 section.
   Anyone else keeps the fixture demo. In live mode the fixture profile view,
   the "Open public page" link and the "Edit profile" button are NOT shown:
   the public page and the editor still render fixtures, and pointing a real
   athlete at fixture content presented as theirs is the exact lie the
   marketplace precedent forbids (§22). The live editor is linked from the
   foot of the page (2S1-FE-09: edits save at once).
   -------------------------------------------------------------------------- */

/** The real profile for a signed-in athlete, or null for the fixture demo. */
async function liveProfile(): Promise<{ p: ApiMyProfile; rates: ApiRate[] } | null> {
  /* No catch: an API outage lands on the error boundary, never on fixtures
     presented as the athlete's own profile (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.includes("ATHLETE")) return null;

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

const STATE_BADGE: Record<SectionState, { tone: "accent" | "warn" | "neutral"; label: string }> = {
  done: { tone: "accent", label: "Complete" },
  missing: { tone: "warn", label: "Missing" },
  "not-collected": { tone: "neutral", label: "Not collected in Phase 1" },
};

/** Humanize a stored enum-ish token: "HIGH_SCHOOL" → "High school". */
function words(s: string): string {
  return (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
}

function SectionContent({ p, k, rates }: { p: ApiMyProfile; k: SectionKey; rates: ApiRate[] }) {
  const dash = <span className="text-faint">—</span>;
  switch (k) {
    case "identity":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted">Display name</dt>
          <dd className="font-medium">{p.displayName}</dd>
          <dt className="text-muted">Legal name</dt>
          <dd className="font-medium">{p.legalName}</dd>
          <dt className="text-muted">Location</dt>
          <dd className="font-medium">
            {[p.city, p.stateCode].filter(Boolean).join(", ") || dash}
          </dd>
          {p.achievements && (
            <>
              <dt className="text-muted">Achievements</dt>
              <dd className="font-medium">{p.achievements}</dd>
            </>
          )}
        </dl>
      );
    case "sport":
      return (
        <p className="text-xs text-muted">
          <span className="font-medium text-text">{p.sport}</span>
          {p.position && <> · {p.position}</>}
          {p.school && <> · {p.school}</>}
          {p.level && <> · {words(p.level)}</>}
          {p.gradYear && <> · Class of {p.gradYear}</>}
        </p>
      );
    case "socials":
      return p.socials.length === 0 ? (
        <p className="text-xs text-muted">No accounts on file yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {p.socials.map((s) => (
            <li key={`${s.platform}:${s.handle}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="font-medium">{words(s.platform)}</span>
              <span className="text-muted">{s.handle}</span>
              {s.followers !== null && (
                <span className="tabular-nums text-muted">
                  {s.followers.toLocaleString("en-US")} followers
                </span>
              )}
              <SourceLabel source={s.source as never} />
            </li>
          ))}
        </ul>
      );
    case "capabilities":
    case "interests": {
      const items = k === "capabilities" ? p.contentCapabilities : p.brandInterests;
      return items.length === 0 ? (
        <p className="text-xs text-muted">Nothing selected yet.</p>
      ) : (
        <p className="flex flex-wrap gap-1.5">
          {items.map((c) => (
            <Badge key={c} tone="neutral">{words(c)}</Badge>
          ))}
        </p>
      );
    }
    case "restrictions":
      return p.restrictedCategories.length === 0 && !p.restrictionNotes?.trim() ? (
        <p className="text-xs text-muted">
          Not answered yet — even &ldquo;none&rdquo; is worth recording, so the
          conflict check can trust it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {p.restrictedCategories.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {p.restrictedCategories.map((c) => (
                <Badge key={c} tone="danger">{words(c)}</Badge>
              ))}
            </p>
          )}
          {p.restrictionNotes?.trim() && (
            <p className="text-xs text-muted">{p.restrictionNotes}</p>
          )}
        </div>
      );
    case "rates":
      /* The athlete's own pay per job — what P3-FE-04 exists to show. These
         are NOT what sponsors pay (catalogue prices are higher and live on
         the sponsor side); §7.1 keeps the two apart in both directions. */
      return rates.length === 0 ? (
        <p className="text-xs text-muted">No rates confirmed yet — BTG sets these with you.</p>
      ) : (
        <div>
          <ul className="space-y-1.5">
            {rates.map((r) => (
              <li key={r.jobId} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium">{r.jobName}</span>
                <span className="tabular-nums text-muted">
                  {money(r.amount)}
                  {r.version > 1 && <span className="text-faint"> · v{r.version}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Your pay per deliverable{p.tier && <> · {words(p.tier)} tier</>}.
            Sponsors see catalogue prices, never these.
          </p>
        </div>
      );
    case "payment":
      return (
        <p className="text-xs text-muted">
          Phase 1 tracks earnings status only. No bank details or tax IDs are
          ever stored, and the payment recipient record arrives in a later
          phase — this section doesn&rsquo;t count against your meter.
        </p>
      );
    case "agreements":
      return (
        <p className="text-xs text-muted">
          {p.agreementsSigned > 0 ? (
            <>
              <span className="font-medium text-text">{p.agreementsSigned}</span>{" "}
              {p.agreementsSigned === 1 ? "agreement" : "agreements"} accepted.
            </>
          ) : (
            <>Nothing signed yet — agreements arrive with your first campaign.</>
          )}
        </p>
      );
  }
}

function LiveProfile({ p, rates }: { p: ApiMyProfile; rates: ApiRate[] }) {
  const states = sectionStates(p);
  const { percent, missing } = completion(states);
  const labelOf = (k: SectionKey) => SECTIONS.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-1 text-xs text-muted">
            What SponsorX holds about you, section by section — public sections
            feed your sponsor-facing profile, private ones stay between you and
            BTG.
          </p>
        </div>
        <Badge tone={p.state === "ACTIVE" ? "accent" : "neutral"}>{words(p.state)}</Badge>
      </div>

      {/* §24 — the meter, derived from the data on this page and nothing else */}
      <div className="sx-animate mt-4 rounded-lg border border-athlete/30 bg-athlete/8 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-xs text-muted">
            <span className="font-semibold text-text">
              Your profile is {percent}% complete.
            </span>{" "}
            {missing.length > 0 ? (
              <>
                Finishing {missing.map((k) => labelOf(k).toLowerCase()).join(", ")}{" "}
                improves how you rank in sponsor matching — your BTG network
                manager can update these with you.
              </>
            ) : (
              <>Every section Phase 1 collects is filled in.</>
            )}
          </p>
        </div>
        <div className="mt-2.5 max-w-xs">
          <Meter value={percent} />
        </div>
      </div>

      {/* §11, section by section */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <Card key={s.key} className={`sx-animate sx-delay-${Math.min(i + 1, 5)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">{s.label}</h2>
              <Badge tone="neutral">{s.scope === "public" ? "Public" : "Private"}</Badge>
              <span className="ml-auto">
                <Badge tone={STATE_BADGE[states[s.key]].tone}>
                  {STATE_BADGE[states[s.key]].label}
                </Badge>
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">{s.blurb}</p>
            <div className="mt-3">
              <SectionContent p={p} k={s.key} rates={rates} />
            </div>
          </Card>
        ))}
      </div>

      <p className="sx-animate sx-delay-5 mt-6 text-[10px] leading-relaxed text-faint">
        To change these details,{" "}
        <Link href="/athlete/profile/edit" className="text-primary-soft hover:underline">edit your profile</Link>
        {" "}— changes save straight away. A legal name, date of birth or guardian
        also tells BTG and re-runs the checks.
      </p>
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* C-2 (check pass): only a signed-in non-athlete — a guardian, or
          staff previewing — reaches this fixture view; it must never read as
          their own profile. */}
      <div className="mb-4">
        <BlockedNotice>
          Demo data — this is a sample profile, not a real one. A guardian
          view of the athlete&rsquo;s profile isn&rsquo;t built yet.
        </BlockedNotice>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Your public profile
          </h1>
          <p className="mt-1 text-xs text-muted">
            What sponsors and fans see when they open your profile — sections
            below appear on the public page exactly as they do here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/athletes/${athletePublic.slug}?from=athlete-profile`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
          >
            Open public page
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden="true"
            >
              <path d="M14 5h5v5M19 5l-9 9M9 5H5v14h14v-4" />
            </svg>
          </a>
          <Link
            href="/athlete/profile/edit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden="true"
            >
              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
            </svg>
            Edit profile
          </Link>
        </div>
      </div>

      {/* A stronger profile earns better matches (§11) — the one owner action
          that belongs on this screen. The checklist itself lives on the
          dashboard. */}
      {missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-athlete/30 bg-athlete/8 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 text-xs text-muted">
              <span className="font-semibold text-text">
                Your profile is {athlete.profileCompletion}% complete.
              </span>{" "}
              Finishing{" "}
              {missing.map((c) => c.label.toLowerCase()).join(", ")} improves
              how you rank in sponsor matching.
            </p>
            <Link
              href={`/athlete/profile/edit?section=${CHECKLIST_SECTION[missing[0].label]}`}
              className="text-[11px] font-medium text-accent transition-colors hover:text-accent-soft"
            >
              Finish now →
            </Link>
          </div>
          <div className="mt-2.5 max-w-xs">
            <Meter value={athlete.profileCompletion} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <AthleteProfileView variant="owner" initialTab={tab} />
      </div>
    </div>
  );
}
