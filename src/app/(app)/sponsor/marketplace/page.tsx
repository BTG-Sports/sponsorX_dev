import Link from "next/link";
import { Badge, Card, SourceLabel } from "@/components/ui";
import {
  INVENTORY_COPY,
  athleteInv,
  marketplacePackages,
  mediaInv,
  money,
  type InventoryState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Marketplace — §9 screen 4, mockup screen 4.

   The mockup draws one grid of BTG media properties priced on CPM. §9.4 says
   Phase 1 must display "standardized SponsorX packages and curated
   inventory", and v2.0 §1 no longer leads with the owned audience — so the
   catalogue carries three tabs and opens on packages. The media cards are
   still here, unchanged, on the third tab.

   Filters are the mockup's, and they are not wired: §9.4 wants sport,
   geography, athlete tier, job type and budget, which needs the eligibility
   query from §13 step 3.

   Phase 1 is a managed marketplace (§17) — "Request" and "Select", never
   "Add to cart".
   -------------------------------------------------------------------------- */

const TABS = [
  { key: "packages", label: "Packages", count: marketplacePackages.length },
  { key: "athletes", label: "Athlete inventory", count: athleteInv.length },
  { key: "media", label: "Media properties", count: mediaInv.length },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATE_TONE: Record<InventoryState, "accent" | "warn" | "primary" | "neutral"> = {
  ACTIVE: "accent",
  LIMITED: "warn",
  BOOKED: "primary",
  SOLD_OUT: "neutral",
};

function FilterBar() {
  const filters = ["All Categories", "All Properties", "All Platforms"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          title="Filters not wired — needs the §13 eligibility query"
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          {f}
          <Chevron />
        </button>
      ))}
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-faint">Sort</span>
        <button
          type="button"
          title="Sort not wired"
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          Popular
          <Chevron />
        </button>
      </span>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-3"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Small square standing in for property or athlete artwork. */
function Thumb({ text }: { text: string }) {
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[9px] font-semibold text-muted">
      {text}
    </div>
  );
}

function CardFrame({
  children,
  featured,
}: {
  children: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col rounded-xl border bg-surface p-4",
        featured ? "border-primary/50" : "border-line",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function MetricPair({
  a,
  b,
}: {
  a: { label: string; value: string };
  b: { label: string; value: string };
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
      {[a, b].map((m) => (
        <div key={m.label}>
          <p className="text-sm font-semibold tabular-nums leading-none tracking-tight">
            {m.value}
          </p>
          <p className="mt-1 text-[10px] leading-none text-faint">{m.label}</p>
        </div>
      ))}
    </div>
  );
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab)
    ? (tab as TabKey)
    : "packages";

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- heading */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Marketplace</h1>
        <p className="mt-1 text-xs text-muted">
          Discover sponsorship opportunities across the BTG ecosystem.
        </p>
      </div>

      {/* ---------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/sponsor/marketplace?tab=${t.key}`}
            className={[
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              t.key === active
                ? "bg-primary/15 text-primary-soft"
                : "text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
            <span className="text-[10px] tabular-nums text-faint">{t.count}</span>
          </Link>
        ))}
      </div>

      <FilterBar />

      {/* ====================================================== packages */}
      {active === "packages" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {marketplacePackages.map((p) => (
              <CardFrame key={p.id} featured={p.featured}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight">
                      {p.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {p.note}
                    </p>
                  </div>
                  <Badge tone={STATE_TONE[p.state]}>
                    {INVENTORY_COPY[p.state]}
                  </Badge>
                </div>

                <MetricPair
                  a={{ label: "Athletes", value: p.athletes }}
                  b={{ label: "Price", value: p.price }}
                />

                <p className="mt-3 flex-1 text-[11px] leading-relaxed text-muted">
                  {p.includes}
                </p>

                <button
                  type="button"
                  title="Creates a CampaignBrief in DRAFT — not wired"
                  className="mt-4 w-full rounded-lg bg-primary py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
                >
                  Request a brief
                </button>
              </CardFrame>
            ))}
          </div>
          <p className="text-[10px] text-faint">
            §7&rsquo;s six packages. Phase 1 sponsors request or reserve — there
            is no self-service checkout until Phase 2 (§17).
          </p>
        </>
      )}

      {/* =============================================== athlete inventory */}
      {active === "athletes" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {athleteInv.map((a) => (
              <CardFrame key={a.id}>
                <div className="flex items-start gap-3">
                  <Thumb
                    text={a.athlete
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-tight">
                      {a.athlete}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {a.sport} · {a.geo}
                    </p>
                  </div>
                  <Badge tone={STATE_TONE[a.state]}>
                    {INVENTORY_COPY[a.state]}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{a.jobId}</Badge>
                  <span className="text-[11px] text-muted">{a.jobName}</span>
                  <span className="ml-auto">
                    <Badge tone="primary">{a.tier}</Badge>
                  </span>
                </div>

                <MetricPair
                  a={{ label: "Audience", value: `${(a.reach / 1000).toFixed(0)}K` }}
                  b={{ label: "Sponsor price", value: money(a.sellPrice) }}
                />

                <div className="mt-2">
                  <SourceLabel source={a.source} />
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/athletes/${a.slug}?from=mk-athletes`}
                    className="flex-1 rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    disabled={a.state === "SOLD_OUT"}
                    title="Adds to a campaign brief — not wired"
                    className="flex-1 rounded-lg bg-primary py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {a.state === "SOLD_OUT" ? "Unavailable" : "Add to brief"}
                  </button>
                </div>
              </CardFrame>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-faint">
            Sponsor prices only. The athlete&rsquo;s own rate
            (<code className="font-mono">AthleteRate.amount</code>) never reaches
            this page — that is the field-level rule in guide §04, and it is a
            §30 acceptance test, not a convention.
          </p>
        </>
      )}

      {/* ================================================ media properties */}
      {active === "media" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mediaInv.map((m) => (
              <CardFrame key={m.id}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-tight">
                      {m.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {m.property}
                    </p>
                  </div>
                  <Thumb
                    text={m.property
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 3)}
                  />
                </div>

                <MetricPair
                  a={{ label: "Est. Views", value: m.estViews }}
                  b={{ label: "CPM", value: `$${m.cpm}` }}
                />

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-base font-semibold tabular-nums tracking-tight">
                    {money(m.price)}
                  </span>
                  <Badge tone={STATE_TONE[m.state]}>
                    {INVENTORY_COPY[m.state]}
                  </Badge>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.platforms.map((p) => (
                    <span
                      key={p}
                      className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-faint"
                    >
                      {p}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/properties/${m.slug ?? "btg-sports-talk"}?from=mk-media`}
                    className="flex-1 rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Property
                  </Link>
                  <Link
                    href={`/sponsor/marketplace/${m.id}?from=mk-media`}
                    className="flex-1 rounded-lg bg-primary py-2 text-center text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
                  >
                    View Details
                  </Link>
                </div>
              </CardFrame>
            ))}
          </div>
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
