import { BackCover, BenefitsSpread, FeatureSpread, MagCover, Newsstand, OpenerSpread } from "@/components/next-about-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";
import { BAND_ITEMS, type EditionCard } from "@/lib/next-about";

/* --------------------------------------------------------------------------
   /next/about — the public SponsorX NEXT programme landing, P1-FE-24.

   Two audiences on one page — students (14–18) and school administrators —
   each with its own next step. At /next/about because /next is the signed-in
   student portal (spec §8 listed both at /next; one URL can't serve two
   pages). The "Latest editions" block is the live GET /public/next/editions;
   everything else is static copy.

   Redesigned 2026-09-30 as a magazine (design spec
   docs/superpowers/specs/2026-09-30-next-about-magazine-design.md): a
   tilting cover with the BTG Sports Talk Magazine logo as masthead, the
   content as paper spreads that page-flip in, all on the landing's dark
   HUD ground. The blocks live in next-about-stage.tsx; this file only
   fetches and lays them out.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "SponsorX NEXT · Student-run high-school sports media" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function editions(): Promise<EditionCard[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/next/editions`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return ((await res.json()) as { editions: EditionCard[] }).editions;
  } catch {
    return null;
  }
}

export default async function NextLandingPage() {
  const list = await editions();
  return (
    <StageReveal className="sx-stage sx-mag relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <MagCover />
      <InsideBand label="In this issue" items={BAND_ITEMS} />
      <OpenerSpread />
      <FeatureSpread />
      <BenefitsSpread />
      <Newsstand list={list} />
      <BackCover />
    </StageReveal>
  );
}
