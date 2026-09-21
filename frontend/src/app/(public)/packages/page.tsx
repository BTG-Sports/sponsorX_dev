import Link from "next/link";
import { Monogram, initials } from "@/components/hero";
import { Badge } from "@/components/ui";
import {
  INVENTORY_COPY,
  marketplacePackages,
  type InventoryState,
} from "@/lib/fixtures";

/** Static stagger classes (globals.css) — index by clamped position. */
const STAGGER = [
  "sx-delay-1",
  "sx-delay-2",
  "sx-delay-3",
  "sx-delay-4",
  "sx-delay-5",
] as const;

/* --------------------------------------------------------------------------
   Sponsor Package Catalog — public, §9 screen 4 · §7.

   The six standardized packages, from the $750 Test Drive to the $15–30K+
   Season Partner. This is the public marketing view; the signed-in sponsor
   catalogue with athlete/media inventory is /sponsor/marketplace.

   Phase 1 is a managed marketplace (§17): a sponsor requests or reserves a
   brief — there is no self-service checkout until Phase 2. Filters are §9.4's
   (sport, geography, athlete tier, job type, budget) and are decorative here;
   wiring needs the §13 step 3 eligibility query.

   The mockup led with media inventory priced at $16–20 CPM. Phase 1 sells
   packages; implied CPM is stored for learning only (§15).
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<InventoryState, "accent" | "warn" | "primary" | "neutral"> = {
  ACTIVE: "accent",
  LIMITED: "warn",
  BOOKED: "primary",
  SOLD_OUT: "neutral",
};

const FILTERS = ["Sport", "Geography", "Athlete tier", "Job type", "Budget"];

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

export default function PackagesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      {/* ------------------------------------------------------------ hero */}
      <div className="max-w-2xl">
        <Badge tone="primary">§7 · Phase 1</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Sponsorship packages
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Standardized ways to work with the SponsorX athlete network — priced,
          scoped and ready to brief. Pick a starting point; BTG matches the
          athletes, checks conflicts and handles the paperwork.
        </p>
      </div>

      {/* --------------------------------------------------------- filters */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
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
      </div>

      {/* ---------------------------------------------------------- grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {marketplacePackages.map((p, i) => (
          <div
            key={p.id}
            className={[
              "flex flex-col rounded-xl border bg-surface p-5 sx-animate",
              STAGGER[Math.min(i, 4)],
              p.featured ? "border-primary/50" : "border-line",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Monogram
                  text={initials(p.name)}
                  tone={p.featured ? "primary" : "accent"}
                  className="size-9 text-[11px]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{p.note}</p>
                </div>
              </div>
              {p.featured ? (
                <Badge tone="primary">Popular</Badge>
              ) : (
                <Badge tone={STATE_TONE[p.state]}>{INVENTORY_COPY[p.state]}</Badge>
              )}
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight">
                {p.price}
              </span>
              <span className="text-[11px] text-faint">{p.athletes} athletes</span>
            </div>

            <p className="mt-3 flex-1 text-[11px] leading-relaxed text-muted">
              {p.includes}
            </p>

            <Link
              href={`/brief?package=${p.id}`}
              className="mt-5 block w-full rounded-lg bg-primary py-2.5 text-center text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
            >
              Request a brief
            </Link>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------- explainer */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["1 · Request a brief", "Tell BTG the goal, budget and market. No card, no checkout."],
          ["2 · BTG matches athletes", "Eligibility, conflicts and rates are handled by BTG staff (§13)."],
          ["3 · Campaign goes live", "You approve content; fans redeem rewards; you get an ROI report."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold tracking-tight">{title}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[10px] leading-relaxed text-faint">
        Phase 1 sponsors request or reserve — there is no self-service checkout
        until Phase 2 (§17). Prices are indicative; the final quote comes from
        BTG after matching. Already know what you want?{" "}
        <Link href="/sponsor/marketplace" className="text-accent hover:underline">
          Browse the full marketplace
        </Link>
        .
      </p>
    </div>
  );
}
