import Link from "next/link";
import { AthleteProfileView } from "@/components/athlete-profile-view";
import { Meter } from "@/components/ui";
import { athlete, athletePublic, profileChecklist } from "@/lib/fixtures";
import { CHECKLIST_SECTION } from "@/lib/profile-sections";

/* --------------------------------------------------------------------------
   Your public profile — inside the Athlete Portal (2026-09-14 UX pass).

   The sidebar's "Public profile" used to link straight to /athletes/[slug],
   throwing the athlete out of their portal into the public site. This page
   keeps them home: the same profile content, framed for its owner — no
   Follow / Request Partnership aimed at yourself (AthleteProfileView's
   "owner" variant swaps those for pointers to Invitations), a completion
   nudge, and the real public URL one labelled new-tab link away. Stale
   ?from=athlete-portal links to the public page redirect here.
   -------------------------------------------------------------------------- */

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const missing = profileChecklist.filter((c) => !c.done);

  return (
    <div className="mx-auto w-full max-w-5xl">
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
