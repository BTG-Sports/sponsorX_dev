import { Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  AthleteCatalog,
  JobsCatalog,
  MediaCatalog,
  PackagesCatalog,
  type CatalogInitial,
  type LiveJob,
  type Pkg,
} from "@/components/marketplace-catalog";
import { parseAmount } from "@/lib/amount";
import { apiFetch, fetchActor } from "@/server/api";
import { toJob, toPkg, type ApiJob, type ApiPackage } from "@/lib/marketplace-live";
import { submitBrief } from "./actions";
import {
  athleteInv,
  marketplacePackages,
  mediaInv,
} from "@/lib/fixtures";
import { StadiumGhost, StadiumHead, StadiumTile, StadiumTiles, StadiumUpdated } from "@/components/stadium-stage";
import { TabLink, TabStrip } from "@/components/stage-table";

/* --------------------------------------------------------------------------
   Sponsor Marketplace — §9 screen 4, on the Stadium Board (P1-ART-23, spec
   2026-10-11 §7.6): "Packages" first — statistics first, plain words, for a
   non-technical sponsor. Three tiles above the catalogue (Ready-made
   packages, Job types, From), computed from the catalogue arrays themselves
   (memory: stats-must-be-retrievable) — this is a bounded, curated price
   list (§7 packages + the NIL job catalogue), so per memory
   pagination-pattern it stays client-paged with the house pager, not server
   paged.

   Three tabs (packages first, §17 managed marketplace — "Request" and "Add to
   brief", never checkout). Each tab is a live client island
   (marketplace-catalog): instant search, filter dropdowns and sort, active
   filters as dismissible chips, page-size + numbered pager, all URL-synced.
   The tab strip stays a server-rendered nav (?tab=), preserving the demo param.

   Sponsor prices only. AthleteRate.amount never reaches this page — the
   field-level rule in guide §04, a §30 acceptance test.

   LIVE vs DEMO (P4-FE-01). A signed-in sponsor sees the REAL catalogue —
   GET /catalogue/packages and /catalogue/jobs, sponsor prices only — and the
   drawer files a REAL brief through the submitBrief server function (DRAFT,
   request-not-checkout, §17). Anyone else, or any ?demo= state, keeps the
   fixture demo exactly as it was. In live mode the media tab is not shown:
   BTG's media properties have no Phase 1 model, and a real sponsor must not
   be shown fixture numbers as if they were inventory.
   -------------------------------------------------------------------------- */

/** Real catalogue for a signed-in sponsor, or null for the fixture demo. */
async function liveCatalogue(): Promise<{ packages: Pkg[]; jobs: LiveJob[]; fromCents: number } | null> {
  /* No catch: fetchActor answers anonymous/unprovisioned as VALUES and throws
     only when the API itself is broken. Swallowing that throw dropped a real
     signed-in sponsor into the fixture demo on any API blip — and the demo
     drawer then faked "Brief received" while sending nothing (QA pass 4).
     An outage must land on the error boundary, same as the catalogue fetch
     below; anonymous visitors never hit the API and still get the demo. */
  const who = await fetchActor();
  if (!who || who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "SPONSOR_ADMIN" || r === "SPONSOR_ANALYST")) return null;
  /* A signed-in sponsor gets the truth or an error page — never fixtures
     presented as their marketplace. */
  const [p, j] = await Promise.all([apiFetch("/catalogue/packages"), apiFetch("/catalogue/jobs")]);
  if (!p.ok || !j.ok) throw new Error(`Catalogue unavailable (${p.status}/${j.status}).`);
  const { packages } = (await p.json()) as { packages: ApiPackage[] };
  const { jobs } = (await j.json()) as { jobs: ApiJob[] };
  /* The live "From" tile reads the API's own numeric priceLow (whole
     dollars → cents) directly, rather than re-parsing the display string
     `toPkg` builds for the card — a round trip through text that can only
     lose precision. */
  const fromCents = packages.length ? Math.min(...packages.map((pk) => pk.priceLow)) * 100 : 0;
  return { packages: packages.map(toPkg), jobs: jobs.map(toJob), fromCents };
}

const TABS = [
  { key: "packages", label: "Packages", count: marketplacePackages.length },
  { key: "athletes", label: "Athlete inventory", count: athleteInv.length },
  { key: "media", label: "Media properties", count: mediaInv.length },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** The three stats a non-technical sponsor reads before anything else:
 *  how many ready-made bundles, how many kinds of jobs, and the cheapest way
 *  in — every figure read straight off the catalogue arrays themselves
 *  (memory: stats-must-be-retrievable), never invented. */
function MarketTiles({ packagesCount, jobTypes, fromCents }: { packagesCount: number; jobTypes: number; fromCents: number }) {
  return (
    <StadiumTiles cols={3}>
      <StadiumTile
        label="Ready-made packages"
        value={packagesCount}
        hint="Bundles BTG has already put together and priced. Pick one and request it — no need to build your own."
        delay={0.1}
      />
      <StadiumTile
        label="Job types"
        value={jobTypes}
        hint="The kinds of posts and appearances athletes can do for you, each already priced by BTG."
        delay={0.16}
      />
      <StadiumTile
        label="From"
        value={fromCents}
        format="usd0"
        hint="The lowest price among our ready-made packages."
        delay={0.22}
      />
    </StadiumTiles>
  );
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading packages" tiles={3} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  /* Flatten to string-only params for the client islands to seed from — the
     live catalogue too, so a shared ?page=2&size=24 link opens on that page
     instead of being rewritten back to page one (P1-ART-23 QA). */
  const initial: CatalogInitial = Object.fromEntries(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [
      string,
      string,
    ][],
  );

  const live = demo === null ? await liveCatalogue() : null;
  if (live) return <LiveMarketplace live={live} initial={initial} />;

  /* A brand-new sponsor can legitimately have an empty catalogue — the empty
     state says so instead of rendering three blank tabs. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <StadiumHead title="Packages" pill="Sample data" />
        <EmptyState
          mark="users"
          title="No inventory matches these filters"
          hint="BTG curates new athlete inventory weekly."
        />
      </div>
    );
  }

  const active: TabKey = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as TabKey)
    : "packages";

  /* Preserve the demo param across tab navigation. */
  const demoParam = typeof sp.demo === "string" ? sp.demo : undefined;
  const tabHref = (key: string) =>
    `/sponsor/marketplace?${new URLSearchParams(
      demoParam ? { tab: key, demo: demoParam } : { tab: key },
    ).toString()}`;

  const fromCents = Math.round(Math.min(...marketplacePackages.map((p) => parseAmount(p.price))) * 100);
  /* "Job types" counts what the Athlete inventory tab actually shows: the
     distinct jobs its cards carry — not an unrelated master rate list the
     demo page never renders. */
  const jobTypes = new Set(athleteInv.map((a) => a.jobId)).size;

  return (
    <div className="space-y-6">
      <StadiumHead title="Packages" pill="Sample data">
        <MarketTiles packagesCount={marketplacePackages.length} jobTypes={jobTypes} fromCents={fromCents} />
      </StadiumHead>

      {/* ---------------------------------------------------------- tabs */}
      <TabStrip label="Catalogue section">
        {TABS.map((t) => (
          <TabLink key={t.key} href={tabHref(t.key)} on={t.key === active} count={t.count}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {/* ====================================================== packages */}
      {active === "packages" && (
        <>
          <PackagesCatalog initial={initial} demoParam={demoParam} />
          <p className="text-[10px] text-faint">
            Our ready-made packages. Pick one and request it — BTG confirms the
            athletes and the price with you before anything is booked.
          </p>
        </>
      )}

      {/* =============================================== athlete inventory */}
      {active === "athletes" && (
        <>
          <AthleteCatalog initial={initial} demoParam={demoParam} />
          <p className="text-[10px] leading-relaxed text-faint">
            The prices shown are what you pay. Follower counts show where they
            came from until each athlete connects their accounts.
          </p>
        </>
      )}

      {/* ================================================ media properties */}
      {active === "media" && (
        <>
          <MediaCatalog initial={initial} demoParam={demoParam} />
          <Card className="border-warn/30 bg-warn/8">
            <p className="text-[11px] leading-relaxed text-warn">
              These are BTG&rsquo;s own media channels, priced per 1,000 people
              reached. They are still available, but our athlete packages are
              now the main way to sponsor — each job there has one fixed
              price.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/** The signed-in sponsor's marketplace — real packages, real jobs, real briefs. */
function LiveMarketplace({ live, initial }: { live: { packages: Pkg[]; jobs: LiveJob[]; fromCents: number }; initial: CatalogInitial }) {
  return (
    <div className="space-y-6">
      <StadiumHead title="Packages" pill={<StadiumUpdated iso={new Date().toISOString()} />}>
        <MarketTiles packagesCount={live.packages.length} jobTypes={live.jobs.length} fromCents={live.fromCents} />
      </StadiumHead>
      <section className="space-y-3">
        {/* A distinct name from the page's own "Packages" h1 — a sponsor's
            screen reader (and this page's own e2e) shouldn't hit two
            same-named headings. */}
        <h2 className="sx-section-title">Ready-made packages</h2>
        <PackagesCatalog items={live.packages} initial={initial} submit={submitBrief} />
      </section>
      <section className="space-y-3">
        <h2 className="sx-section-title">Job types</h2>
        <JobsCatalog jobs={live.jobs} submit={submitBrief} />
      </section>
      <p className="text-[10px] leading-relaxed text-faint">
        Sponsor prices. A request, not a purchase — BTG matches athletes, checks
        category conflicts and prices the campaign, then follows up.
      </p>
    </div>
  );
}
