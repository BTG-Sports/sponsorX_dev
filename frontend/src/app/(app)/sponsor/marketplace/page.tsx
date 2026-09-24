import Link from "next/link";
import { Card } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
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
import { apiFetch, fetchActor } from "@/server/api";
import { toJob, toPkg, type ApiJob, type ApiPackage } from "@/lib/marketplace-live";
import { submitBrief } from "./actions";
import {
  athleteInv,
  marketplacePackages,
  mediaInv,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Marketplace — §9 screen 4, redesigned per spec 2026-09-11 and wired
   for real client-side filtering 2026-09-15.

   Three tabs (packages first, §17 managed marketplace — "Request" and "Add to
   brief", never checkout). Each tab is now a live client island
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
async function liveCatalogue(): Promise<{ packages: Pkg[]; jobs: LiveJob[] } | null> {
  const who = await fetchActor().catch(() => null);
  if (!who || who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "SPONSOR_ADMIN" || r === "SPONSOR_ANALYST")) return null;
  /* A signed-in sponsor gets the truth or an error page — never fixtures
     presented as their marketplace. */
  const [p, j] = await Promise.all([apiFetch("/catalogue/packages"), apiFetch("/catalogue/jobs")]);
  if (!p.ok || !j.ok) throw new Error(`Catalogue unavailable (${p.status}/${j.status}).`);
  const { packages } = (await p.json()) as { packages: ApiPackage[] };
  const { jobs } = (await j.json()) as { jobs: ApiJob[] };
  return { packages: packages.map(toPkg), jobs: jobs.map(toJob) };
}

const TABS = [
  { key: "packages", label: "Packages", count: marketplacePackages.length },
  { key: "athletes", label: "Athlete inventory", count: athleteInv.length },
  { key: "media", label: "Media properties", count: mediaInv.length },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const live = demo === null ? await liveCatalogue() : null;
  if (live) return <LiveMarketplace live={live} />;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Marketplace</h1>
      {demo === "empty" ? (
        <p className="mt-1 text-xs text-muted">curated by BTG</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          {athleteInv.length} athletes · {marketplacePackages.length} packages
          · curated by BTG
        </p>
      )}
    </div>
  );

  /* A brand-new sponsor can legitimately have an empty catalogue — the empty
     state says so instead of rendering three blank tabs. */
  if (demo === "empty") {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {heading}
        </div>
        <EmptyState
          mark="users"
          title="No inventory matches these filters"
          hint="BTG curates new athlete inventory weekly."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as TabKey)
    : "packages";

  /* Flatten to string-only params for the client island to seed from, and
     preserve the demo param across tab navigation. */
  const demoParam = typeof sp.demo === "string" ? sp.demo : undefined;
  const initial: CatalogInitial = Object.fromEntries(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [
      string,
      string,
    ][],
  );
  const tabHref = (key: string) =>
    `/sponsor/marketplace?${new URLSearchParams(
      demoParam ? { tab: key, demo: demoParam } : { tab: key },
    ).toString()}`;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading}
      </div>

      {/* ---------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={[
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              t.key === active
                ? "bg-sponsor/15 text-sponsor"
                : "text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
            <span className="text-[10px] tabular-nums text-faint">{t.count}</span>
          </Link>
        ))}
      </div>

      {/* ====================================================== packages */}
      {active === "packages" && (
        <>
          <PackagesCatalog initial={initial} demoParam={demoParam} />
          <p className="text-[10px] text-faint">
            §7&rsquo;s six packages. Phase 1 sponsors request or reserve — there
            is no self-service checkout until Phase 2 (§17).
          </p>
        </>
      )}

      {/* =============================================== athlete inventory */}
      {active === "athletes" && (
        <>
          <AthleteCatalog initial={initial} demoParam={demoParam} />
          <p className="text-[10px] leading-relaxed text-faint">
            Sponsor prices only. The athlete&rsquo;s own rate
            (<code className="font-mono">AthleteRate.amount</code>) never reaches
            this page — that is the field-level rule in guide §04, and it is a
            §30 acceptance test, not a convention. Follower counts carry their
            source until accounts are connected (§22).
          </p>
        </>
      )}

      {/* ================================================ media properties */}
      {active === "media" && (
        <>
          <MediaCatalog initial={initial} demoParam={demoParam} />
          <Card className="border-warn/30 bg-warn/8">
            <p className="text-[11px] leading-relaxed text-warn">
              These are BTG&rsquo;s own media properties, priced on CPM — the
              pre-v2.0 model. Blueprint v2.0 §1 replaced the owned-audience
              launch with the micro-NIL athlete network, and §15 says fixed job
              pricing is what Phase 1 sells while implied CPM is stored for
              learning. Kept as inventory; no longer the lead product.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/** The signed-in sponsor's marketplace — real packages, real jobs, real briefs. */
function LiveMarketplace({ live }: { live: { packages: Pkg[]; jobs: LiveJob[] } }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Marketplace</h1>
        <p className="mt-1 text-xs text-muted">
          {live.packages.length} packages · {live.jobs.length} NIL jobs · curated by BTG
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Packages</h2>
        <PackagesCatalog items={live.packages} submit={submitBrief} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">NIL jobs</h2>
        <JobsCatalog jobs={live.jobs} submit={submitBrief} />
      </section>
      <p className="text-[10px] leading-relaxed text-faint">
        Sponsor prices. A request, not a purchase — BTG matches athletes, checks
        category conflicts and prices the campaign, then follows up (§17).
      </p>
    </div>
  );
}
