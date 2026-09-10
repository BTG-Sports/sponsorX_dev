import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import { compact } from "@/components/line-chart";
import {
  INVENTORY_COPY,
  athleteInv,
  marketplacePackages,
  mediaInv,
  money,
  type InventoryState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Marketplace — §9 screen 4, redesigned per spec 2026-09-11.

   Same catalogue structure as before (three tabs, packages first, §17 managed
   marketplace — "Request" and "Add to brief", never checkout), with the new
   visual language: gradient identity bands, 3-stat strips with provenance
   chips, filter chips.

   Filters stay decorative: §9.4 wants sport, geography, athlete tier, job
   type and budget, which needs the eligibility query from §13 step 3 (B3).

   Sponsor prices only. AthleteRate.amount never reaches this page — the
   field-level rule in guide §04, a §30 acceptance test.
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

function FilterChips() {
  return (
    <div className="sx-snap-x flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
      <button
        type="button"
        title="Filters not wired — needs the §13 eligibility query"
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary-soft"
      >
        Basketball ✕
      </button>
      {["Sport", "Geography", "Tier", "Budget"].map((f) => (
        <button
          key={f}
          type="button"
          title="Filters not wired — needs the §13 eligibility query"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          {f}
          <Chevron />
        </button>
      ))}
    </div>
  );
}

/** Shared card frame: identity band on top, body below. */
function IdentityCard({
  dimmed,
  band,
  children,
}: {
  dimmed?: boolean;
  band: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={["overflow-hidden p-0", dimmed ? "opacity-75" : ""].join(" ")}>
      <div className="flex items-center gap-3 bg-gradient-to-br from-primary/20 to-transparent p-4">
        {band}
      </div>
      {children}
    </Card>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Marketplace</h1>
          <p className="mt-1 text-xs text-muted">
            {athleteInv.length} athletes · {marketplacePackages.length} packages
            · curated by BTG
          </p>
        </div>
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
                ? "bg-sponsor/15 text-sponsor"
                : "text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
            <span className="text-[10px] tabular-nums text-faint">{t.count}</span>
          </Link>
        ))}
      </div>

      <FilterChips />

      {/* ====================================================== packages */}
      {active === "packages" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {marketplacePackages.map((p, i) => (
              <div key={p.id} className={`sx-animate sx-delay-${Math.min(i + 1, 5)}`}>
                <IdentityCard
                  band={
                    <>
                      <Monogram
                        text={initials(p.name)}
                        tone={p.featured ? "accent" : "primary"}
                        className="size-10 text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold tracking-tight">
                          {p.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {p.note}
                        </p>
                      </div>
                      {p.featured ? (
                        <Badge tone="primary">Popular</Badge>
                      ) : (
                        <Badge tone={STATE_TONE[p.state]}>
                          {INVENTORY_COPY[p.state]}
                        </Badge>
                      )}
                    </>
                  }
                >
                  <div className="grid grid-cols-2 divide-x divide-line-soft border-y border-line-soft">
                    <div className="px-4 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {p.price}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">price</p>
                    </div>
                    <div className="px-4 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {p.athletes}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">athletes</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="min-h-8 text-[11px] leading-relaxed text-muted">
                      {p.includes}
                    </p>
                    <button
                      type="button"
                      title="Creates a CampaignBrief in DRAFT — not wired"
                      className="mt-3 w-full rounded-lg bg-primary py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
                    >
                      Request a brief
                    </button>
                  </div>
                </IdentityCard>
              </div>
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
            {athleteInv.map((a, i) => {
              const soldOut = a.state === "SOLD_OUT";
              return (
                <div key={a.id} className={`sx-animate sx-delay-${Math.min(i + 1, 5)}`}>
                  <IdentityCard
                    dimmed={soldOut}
                    band={
                      <>
                        <Monogram
                          text={initials(a.athlete)}
                          shape="circle"
                          tone={soldOut ? "neutral" : "primary"}
                          className="size-10 text-xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight">
                            {a.athlete}
                            {a.verified && (
                              <span
                                title="Verified athlete"
                                className="text-primary-soft"
                              >
                                ✔
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted">
                            {a.sport} · {a.geo}
                          </p>
                        </div>
                        {soldOut ? (
                          <Badge tone="neutral">Sold out</Badge>
                        ) : (
                          <Badge tone="primary">{a.tier} tier</Badge>
                        )}
                      </>
                    }
                  >
                    <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold tabular-nums tracking-tight">
                          {compact(a.reach)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                          followers{" "}
                          <MiniChip kind={a.verified ? "ver" : "warn"}>
                            {a.verified ? "VER" : "SELF"}
                          </MiniChip>
                        </p>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold tabular-nums tracking-tight">
                          {a.engagementRate}%
                        </p>
                        <p className="mt-0.5 text-[10px] text-faint">engagement</p>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold tabular-nums tracking-tight">
                          {a.onTimeRate}%
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                          on-time <MiniChip kind="ver">VER</MiniChip>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <Badge tone="neutral">{a.jobId}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                        {a.jobName}
                      </span>
                      <span className="text-sm font-bold tabular-nums tracking-tight">
                        {money(a.sellPrice)}
                      </span>
                    </div>
                    <div className="flex gap-2 px-4 pb-4">
                      <Link
                        href={`/athletes/${a.slug}?from=mk-athletes`}
                        className="flex-1 rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        disabled={soldOut}
                        title={
                          soldOut
                            ? "Sold out — waitlist not wired"
                            : "Adds to a campaign brief — not wired"
                        }
                        className="flex-1 rounded-lg bg-accent py-2 text-[11px] font-medium text-white transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {soldOut ? "Join waitlist" : "Add to brief"}
                      </button>
                    </div>
                  </IdentityCard>
                </div>
              );
            })}
          </div>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mediaInv.map((m, i) => (
              <div key={m.id} className={`sx-animate sx-delay-${Math.min(i + 1, 5)}`}>
                <IdentityCard
                  band={
                    <>
                      <Monogram
                        text={initials(m.property)}
                        tone="neutral"
                        className="size-10 text-[10px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold tracking-tight">
                          {m.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {m.property}
                        </p>
                      </div>
                      <Badge tone={STATE_TONE[m.state]}>
                        {INVENTORY_COPY[m.state]}
                      </Badge>
                    </>
                  }
                >
                  <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {m.estViews}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                        est. views <MiniChip kind="est" />
                      </p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        ${m.cpm}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">CPM</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {money(m.price)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-faint">price</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 px-4 pt-3">
                    {m.platforms.map((p) => (
                      <span
                        key={p}
                        className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-faint"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 px-4 py-4">
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
                </IdentityCard>
              </div>
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
