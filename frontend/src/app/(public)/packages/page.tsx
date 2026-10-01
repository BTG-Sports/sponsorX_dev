import {
  BriefSteps,
  Catalogue,
  InsideBand,
  PackagesClose,
  PackagesHero,
  PriceLadder,
  type PackageView,
} from "@/components/packages-stage";
import { StageReveal } from "@/components/packages-fx";
import { marketplacePackages, rates } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Package Catalog — public, §9 screen 4 · §7.

   The six standardized packages, from the $750 Test Drive to the $15–30K+
   Season Partner. This is the public marketing view; the signed-in sponsor
   catalogue with athlete/media inventory is /sponsor/marketplace.

   Redesigned 2026-09-30 to match the landing page's visual language: a
   fixed-dark stage (packages-stage.tsx) with the HUD hero and its "THE
   RANGE" card, the what's-inside band, the log-scale price ladder, the
   glass catalogue cards, the three managed steps and the closing panel.
   This file only fetches, normalises and lays the sections out.

   Phase 1 is a managed marketplace (§17): a sponsor requests or reserves a
   brief — there is no self-service checkout until Phase 2. Filters are §9.4's
   (sport, geography, athlete tier, job type, budget) and are decorative here;
   wiring needs the §13 step 3 eligibility query.

   The mockup led with media inventory priced at $16–20 CPM. Phase 1 sells
   packages; implied CPM is stored for learning only (§15).

   LIVE vs FALLBACK (P3-FE-05). The grid prefers the REAL price list —
   GET /public/catalogue/packages, sponsor prices only, each package with its
   job-code line items — and keeps the fixture grid only when the API cannot
   answer (a marketing page must not 500 on a blip, and its footer already
   declares every price indicative). Athlete pay cannot appear here: the
   public read shares the sponsor read's field list, which never selects it.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type LivePackage = {
  id: string;
  code: string;
  name: string;
  priceLow: number;
  priceHigh: number;
  athleteCountMin: number;
  athleteCountMax: number;
  lineItems: { jobCode: string; quantityPerAthlete: number }[];
  exclusivity: boolean;
  durationWeeks: number | null;
};

/** Whole dollars, as §7 stores them. */
const usd = (d: number) => `$${d.toLocaleString("en-US")}`;
const priceRange = (p: LivePackage) =>
  p.priceLow === p.priceHigh ? usd(p.priceLow) : `${usd(p.priceLow)}–${usd(p.priceHigh)}`;
const athleteRange = (p: LivePackage) =>
  p.athleteCountMin === p.athleteCountMax
    ? `${p.athleteCountMin}`
    : `${p.athleteCountMin}–${p.athleteCountMax}`;

/** §5 job names by code, so a live line item reads "2× Athlete Reel" and not
 *  "2× SX-03" — the code stays in the title for the ones that know it. */
const JOB_NAME = Object.fromEntries(rates.map((r) => [r.jobId, r.name]));
const jobLine = (li: LivePackage["lineItems"][number]) =>
  `${li.quantityPerAthlete}× ${JOB_NAME[li.jobCode] ?? li.jobCode}`;

async function livePackages(): Promise<LivePackage[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/catalogue/packages`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const { packages } = (await res.json()) as { packages: LivePackage[] };
    return packages.length > 0 ? packages : null;
  } catch {
    return null;
  }
}

/** Fixture prices are display strings ("$1,500–$3,000", "~$5,000",
 *  "$15K–$30K+"); the ladder and range card need numbers. */
function parseDollars(s: string): [number, number] {
  const nums = s.match(/\$\s*[\d,.]+K?/g) ?? [];
  const toNum = (t: string) => {
    const k = /K/i.test(t);
    const n = parseFloat(t.replace(/[^\d.]/g, ""));
    return Math.round(k ? n * 1000 : n);
  };
  const vals = nums.map(toNum);
  return vals.length === 0 ? [0, 0] : [vals[0], vals[vals.length - 1]];
}

const fromLive = (p: LivePackage, i: number, all: LivePackage[]): PackageView => ({
  key: p.code,
  code: p.code,
  name: p.name,
  meta: [p.durationWeeks ? `${p.durationWeeks}-week campaign` : "Flexible duration", p.exclusivity && "category exclusivity"]
    .filter(Boolean)
    .join(" · "),
  price: priceRange(p),
  low: p.priceLow,
  high: p.priceHigh,
  athletes: athleteRange(p),
  athleteMin: p.athleteCountMin,
  athleteMax: p.athleteCountMax,
  items: p.lineItems.map(jobLine),
  // The live list carries no "popular" flag; light the middle of the range.
  featured: i === Math.floor((all.length - 1) / 2),
  exclusive: p.exclusivity,
});

const fromFixture = (p: (typeof marketplacePackages)[number]): PackageView => {
  const [low, high] = parseDollars(p.price);
  const a = p.athletes.match(/\d+/g)?.map(Number) ?? [];
  return {
    key: p.id,
    name: p.name,
    meta: p.note,
    price: p.price,
    low,
    high,
    athletes: p.athletes,
    athleteMin: a[0] ?? null,
    athleteMax: a[a.length - 1] ?? null,
    // "Short-form content + stories" → one line each, sentence-cased.
    items: p.includes
      .split(/\s*\+\s*|,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1)),
    featured: Boolean(p.featured),
    // The fixture's "includes" already names exclusivity where it applies.
    exclusive: false,
    state: p.state,
  };
};

export default async function PackagesPage() {
  const live = await livePackages();
  const pkgs = live
    ? [...live].sort((a, b) => a.priceLow - b.priceLow).map(fromLive)
    : marketplacePackages.map(fromFixture);

  // What the packages contain, once each, for the band.
  const inside = Array.from(new Set(pkgs.flatMap((p) => p.items.map((it) => it.replace(/^\d+×\s*/, "")))));

  return (
    <StageReveal className="sx-stage relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <PackagesHero pkgs={pkgs} live={Boolean(live)} />
      <InsideBand items={inside} />
      <PriceLadder pkgs={pkgs} />
      <Catalogue pkgs={pkgs} />
      <BriefSteps />
      <PackagesClose />
    </StageReveal>
  );
}
