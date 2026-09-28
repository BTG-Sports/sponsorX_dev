import Link from "next/link";
import {
  Badge,
  BlockedNotice,
  Button,
  Card,
  Meter,
  SectionHeading,
  SourceLabel,
} from "@/components/ui";
import { compact } from "@/components/charts";
import { HeroBand, MiniChip, Monogram, initials } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  INVENTORY_COPY,
  money,
  property,
  propertyShowcase,
  type InventoryState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Property Portal — §8 PROPERTY_MGR. Redesigned 2026-09-11 (A2).

   The dashboard a property manager (here, BTG Sports Talk) works: their own
   roster, their sponsorship inventory and their analytics. Scoping is the
   point — a PROPERTY_MGR sees only their own property's athletes and campaigns
   (guide §09, enforced as a §30 cross-tenant test). On fixtures this is one
   property; the real query is tenant + property scoped.

   The showcase hero answers "what audience value has this property delivered
   this season?": estimated views, views priced at curated CPM,
   inventory sell-through and roster reach — every figure provenance-tagged
   (§22). `propertyShowcase.rosterCount` is the platform-wide count (Postgres);
   the `property.roster` fixture below it is a small in-portal sample, so the
   roster section is framed as a sample against that count rather than
   contradicting it.

   The public, sponsor-facing version of this property is
   /properties/btg-sports-talk. This portal is the owner's side of it.
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<InventoryState, "accent" | "warn" | "primary" | "neutral"> = {
  ACTIVE: "accent",
  LIMITED: "warn",
  BOOKED: "primary",
  SOLD_OUT: "neutral",
};

export default async function PropertyPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const p = property;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
          <Badge tone="neutral">{p.kind}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          {p.subtitle} · {p.formats.join(" · ")}
        </p>
      </div>
      <Link
        href={`/properties/${p.slug}?from=property`}
        className="text-xs font-medium text-property hover:underline"
      >
        View public page →
      </Link>
    </div>
  );

  /* Brand-new property, no athletes approved yet: no roster, no inventory
     activity worth showcasing — the screen is the next step, not a hero band
     built on zeros. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="users"
          title="No roster on the platform yet"
          hint="Your athletes appear here once their applications are approved."
          action={{ label: "How athletes join", href: "/join" }}
        />
      </div>
    );
  }

  const openOpportunities = p.opportunities.filter(
    (o) => o.state === "ACTIVE" || o.state === "LIMITED",
  ).length;

  return (
    <div className="space-y-6">
      {heading}

      {/* P7-QA-02: no live read on this portal yet (GET /properties/mine
          exists but isn't called) — every figure below, POSTGRES and
          VERIFIED chips included, is the BTG Sports Talk fixture, and the
          curated CPM names no origin or date. */}
      {!demo && (
        <BlockedNotice>
          Demo data — your property&rsquo;s roster, inventory and analytics
          aren&rsquo;t connected yet, so every figure below is a sample
          property&rsquo;s.
        </BlockedNotice>
      )}

      {/* ----------------------------------------------------- showcase hero */}
      <HeroBand border="border-property/30" className="sx-animate">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Audience value delivered · season to date
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-property),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {compact(propertyShowcase.estSeasonViews)} est. views
              </span>
              <MiniChip kind="est">EST</MiniChip>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              {/* F-11 / QA pass 6 (P6-FE-08): an estimate of views priced at a
                  curated CPM — not "media value" the property earned. Same
                  words as the sponsor report. */}
              Views priced at curated CPM ≈ {money(propertyShowcase.impliedMediaValueCents)}
              <MiniChip kind="est">EST · curated</MiniChip>
            </p>
          </div>

          <div className="w-full shrink-0 sm:w-56">
            <p className="text-[11px] font-medium text-muted">
              Inventory sell-through
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-lg font-semibold tabular-nums">
                {propertyShowcase.sellThroughPct}%
              </span>
              <span className="text-[11px] text-faint">
                {propertyShowcase.slotsBooked} of{" "}
                {propertyShowcase.slotsTotal} slots booked
              </span>
            </p>
            <div className="mt-2">
              <Meter value={propertyShowcase.sellThroughPct} />
            </div>
            <p className="mt-2">
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="font-semibold text-text">
                {propertyShowcase.rosterCount}
              </span>
              athletes
              <MiniChip kind="ver">POSTGRES</MiniChip>
              · {propertyShowcase.avgEngagementPct}% avg engagement
              <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
            </p>
          </div>
        </div>
      </HeroBand>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        {/* ================================================ inventory */}
        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-1">
            <SectionHeading
              title="Sponsorship inventory"
              hint={`${openOpportunities} open · what sponsors can buy against this property`}
            />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {p.opportunities.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <Monogram
                      text={initials(o.name)}
                      tone="primary"
                      className="size-8 text-[10px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{o.name}</p>
                      <p className="truncate text-[11px] text-faint">
                        {o.detail}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tabular-nums">
                      {money(o.price)}
                    </span>
                    <Badge tone={STATE_TONE[o.state]}>
                      {INVENTORY_COPY[o.state]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* -------------------------------------------------- roster */}
          <section className="sx-animate sx-delay-2">
            <SectionHeading
              title="Your roster"
              hint={`${propertyShowcase.rosterCount} athletes on the platform · showing ${p.roster.length} — §09 scoped to this property`}
            />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {p.roster.map((a) => (
                  <li key={a.slug} className="flex items-center gap-3 px-4 py-3">
                    <Monogram
                      text={initials(a.name)}
                      tone="neutral"
                      shape="circle"
                      className="size-8 text-[10px]"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/athletes/${a.slug}?from=property`}
                        className="block truncate text-xs font-medium hover:text-property"
                      >
                        {a.name}
                      </Link>
                      <p className="truncate text-[11px] text-faint">
                        {a.sport}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      href={`/athletes/${a.slug}?from=property`}
                    >
                      Profile
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>

        {/* ==================================================== side rail */}
        <div className="space-y-4">
          <Card className="sx-animate sx-delay-1">
            <SectionHeading title="About" />
            <p className="text-[11px] leading-relaxed text-muted">{p.about}</p>
          </Card>

          <Card className="sx-animate sx-delay-2">
            <SectionHeading
              title="Analytics"
              hint="§22 — every figure carries its source"
            />
            <ul className="space-y-3">
              {p.stats.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted">{s.label}</p>
                    <p className="text-sm font-semibold tabular-nums leading-tight">
                      {s.value}
                    </p>
                  </div>
                  <SourceLabel source={s.source} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="sx-animate sx-delay-3">
            <p className="text-[11px] font-medium text-muted">
              Scoped access
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              This portal is limited to {p.name}. A property manager cannot see
              other properties&rsquo; athletes, campaigns or inventory — that
              is the tenant/property scope in guide §09, tested per §30.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
