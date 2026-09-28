import { BackLink } from "@/components/back-link";
import { ProfileEditor } from "@/components/profile-editor";
import { BlockedNotice } from "@/components/ui";

/* --------------------------------------------------------------------------
   Edit profile — §11 sections as an in-portal hub (2026-09-14).

   Prototype ahead of P3-BE-01/05 and P3-FE-03: the forms are real, the
   persistence isn't — edits live in this tab and the page says so. The
   managed-marketplace framing (§10) is the important part to get right now:
   Save queues a change for BTG review, nothing claims to publish instantly.
   -------------------------------------------------------------------------- */

export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;

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
