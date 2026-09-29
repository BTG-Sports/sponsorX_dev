import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { resolveBack } from "@/lib/back";
import { ActiveProfile } from "./active-profile";
import { FeaturedProfile, fetchPublicAthlete } from "./featured-profile";

/* --------------------------------------------------------------------------
   Athlete Profile — §9 screen 5, mockup screen 6.

   This is the SPONSOR-FACING profile. It is not the Athlete Portal (§9
   screen 6, built at /athlete) — the mockup labels this one "Athlete
   Profile", which is easy to confuse. Athletes reviewing their own public
   face use the in-portal preview at /athlete/profile and never land here
   from their sidebar.

   LIVE (P3-FE-08, 2026-09-29). Every slug is answered by
   GET /public/athletes/:slug: a FEATURED athlete renders as editorial with
   the claim as its only action (P1-FE-28 / P9-FE-08); an ACTIVE athlete
   renders their §11 public sections. An unknown slug is a not-found, and an
   API outage is an error page — the fixture athlete that used to stand in
   for both is gone from this route (it remains the portal preview's demo).
   What the athlete is paid (AthleteRate) never reaches this page: the API
   does not send it (guide §04, tested per §30).
   -------------------------------------------------------------------------- */

/** The tab title from the live profile, and the not-found decided as early
 *  as the framework allows. Under the (public) loading boundary the HTML
 *  streams, so an unknown slug renders the not-found page inside a 200
 *  shell — the same as /properties/[slug] and every other public page here;
 *  a 404 status would need the boundary gone. The page's own lookup is
 *  memoised by Next for the same request, so this is still one fetch. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const live = await fetchPublicAthlete(slug);
  if (live.kind === "missing") notFound();
  if (live.kind === "down") return { title: "Athlete profile · SponsorX" };
  return { title: `${live.athlete.displayName} · SponsorX`, robots: live.athlete.featured ? undefined : { index: true } };
}

export default async function AthleteProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;

  /* An athlete following their old sidebar link (or any stale bookmark of
     it) belongs on the in-portal view, not on the public site. */
  if (from === "athlete-portal") redirect("/athlete/profile");

  const back = resolveBack(from, "mk-athletes");

  const live = await fetchPublicAthlete(slug);
  if (live.kind === "missing") notFound();
  if (live.kind === "down") throw new Error("This profile can't be loaded right now.");
  const a = live.athlete;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      {/* Orientation row: the way back on the left, and — for anyone who
          arrived out of a portal — a plain statement of which surface this
          is, so the context switch is never a surprise. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink target={back} />
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
          {a.featured ? "Featured profile · editorial" : "Public profile · visible to anyone"}
        </span>
      </div>
      <div className="mt-4">{a.featured ? <FeaturedProfile a={a} /> : <ActiveProfile a={a} />}</div>
    </div>
  );
}
