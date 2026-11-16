import Link from "next/link";

import { AthletePublicPage } from "@/components/athlete-public-page/athlete-public-page";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { StadiumHead, StadiumPanel } from "@/components/stadium-stage";
import { requirePortalAccess } from "@/server/portal";
import { fetchPublicAthlete } from "../../../../(public)/athletes/[slug]/featured-profile";

import "../../shop/shop.css";
import "./athlete-stadium.css";

/* --------------------------------------------------------------------------
   An athlete's profile, inside the sponsor portal — POL-FE-91.

   The owner (2026-11-16): "when clicking View Athlete Profile, can we see it
   inside the dashboard of the logged-in account, not a new tab". So a shop
   item's "View Athlete Profile" lands here, in the sponsor's own shell
   (memory: portal-views-stay-in-portal), on the SAME page the public
   /athletes/[slug] draws (AthletePublicPage), in its `sponsor` mode: the
   sponsor's action ("Request a proposal") stays, the athlete-facing
   "Is this you?" goes. Its colours are the portal's tokens, so it is lit in
   the Stadium's blue here.

   Reads GET /public/athletes/:slug — the one answer every sponsor gets (no
   legal name, contact, age or rates; a minor's photo only once BTG approved
   it — the API decides). Only an ACTIVE athlete's page: a FEATURED
   (editorial, not yet claimed) profile sells nothing and is said so.

   `?item=<listing id>` (the shop item it came from) makes the way back
   "Back to the item"; otherwise it goes back to the shop.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function SponsorAthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePortalAccess("sponsor");
  const { slug } = await params;
  const item = (await searchParams).item;
  const fromItem = typeof item === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item) ? item : null;
  const back = fromItem ? { href: `/sponsor/shop/${encodeURIComponent(fromItem)}`, label: "Back to the item" } : { href: "/sponsor/shop", label: "Back to the shop" };

  const live = await fetchPublicAthlete(slug);
  if (live.kind === "down") throw new Error("This profile can't be loaded right now.");
  if (live.kind === "missing" || live.athlete.featured) {
    return (
      <div className="space-y-6">
        <StadiumHead
          title="Athlete"
          actions={
            <Link href={back.href} className="sx-sh-head-link">
              ← {back.label}
            </Link>
          }
        />
        <StadiumPanel delay={0.1} className="p-5">
          <p className="text-sm font-semibold">This athlete&rsquo;s profile isn&rsquo;t open</p>
          <p className="mt-1 text-xs text-muted">It may not be live on SponsorX yet, or the link is wrong.</p>
        </StadiumPanel>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={back.href} className="sx-sh-head-link inline-flex items-center gap-1.5">
          <Glyph ui="back" className="size-4" />
          {back.label}
        </Link>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">Athlete profile · what every sponsor sees</span>
      </div>
      <AthletePublicPage a={live.athlete} mode="sponsor" />
    </div>
  );
}
