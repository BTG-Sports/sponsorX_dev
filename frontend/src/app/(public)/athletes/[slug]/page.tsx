import { redirect } from "next/navigation";
import { AthleteProfileView } from "@/components/athlete-profile-view";
import { BackLink } from "@/components/back-link";
import { resolveBack } from "@/lib/back";
import { FeaturedProfile, fetchPublicAthlete } from "./featured-profile";

/* --------------------------------------------------------------------------
   Athlete Profile — §9 screen 5, mockup screen 6.

   This is the SPONSOR-FACING profile: Follow, Request Partnership, and
   inventory at sponsor prices. It is not the Athlete Portal (§9 screen 6,
   built at /athlete) — the mockup labels this one "Athlete Profile", which is
   easy to confuse. Athletes reviewing their own public face use the in-portal
   preview at /athlete/profile and never land here from their sidebar.

   The view itself (tabs, Follow, inventory, provenance) lives in
   AthleteProfileView, shared with that preview. Prices there are what a
   sponsor pays; AthleteRate.amount — what the athlete is paid — must never
   render (guide §04, tested per §30).
   -------------------------------------------------------------------------- */

export default async function AthleteProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const { from, tab } = await searchParams;

  /* An athlete following their old sidebar link (or any stale bookmark of
     it) belongs on the in-portal view, not on the public site. */
  if (from === "athlete-portal") redirect("/athlete/profile");

  const back = resolveBack(from, "mk-athletes");

  /* P1-FE-28 / P9-FE-08 — a FEATURED athlete renders as editorial with the
     claim as its only action. Every other slug keeps the existing profile
     view unchanged (the ACTIVE behaviour this task must not move). */
  const live = await fetchPublicAthlete(slug);
  if (live?.featured) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackLink target={back} />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">Featured profile · editorial</span>
        </div>
        <div className="mt-4">
          <FeaturedProfile a={live} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      {/* Orientation row: the way back on the left, and — for anyone who
          arrived out of a portal — a plain statement of which surface this
          is, so the context switch is never a surprise. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink target={back} />
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
          Public profile · visible to anyone
        </span>
      </div>

      <div className="mt-4">
        <AthleteProfileView variant="public" initialTab={tab} />
      </div>

      <p className="mt-8 text-[10px] text-faint">
        Fixture data — requested slug <code className="font-mono">{slug}</code>.
      </p>
    </div>
  );
}
