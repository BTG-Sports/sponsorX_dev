import Link from "next/link";
import { BuildPreview } from "@/components/build-preview";
import { CountUp } from "@/components/count-up";
import { Logo } from "@/components/logo";
import { networkStats } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   SponsorX Network Landing — §9 screen 1, mockup screen 1.

   Hero, CTAs and stats bar follow the mockup. The sections below the fold are
   §9.1's remaining requirements, which the mockup thumbnail does not show:
   explain the Athlete Network, the sponsor packages, the content-partner
   opportunity, and leave slots for proof / case studies.
   -------------------------------------------------------------------------- */

/** Static stagger classes for the stats bar — one per networkStats tile. */
const DELAYS = ["sx-delay-1", "sx-delay-2", "sx-delay-3", "sx-delay-4"] as const;

/** §39's operating loop, written for a sponsor rather than an engineer. */
const STEPS = [
  {
    n: "01",
    title: "Tell us the goal",
    body: "Objective, budget, market and category. One brief, no media plan required.",
  },
  {
    n: "02",
    title: "We match athletes",
    body: "Selected on engagement, content quality, reliability and audience fit — not follower count.",
  },
  {
    n: "03",
    title: "Athletes activate",
    body: "Content, appearances and QR-backed fan rewards, each with its own tracking code.",
  },
  {
    n: "04",
    title: "You get the numbers",
    body: "Verified delivery, scan-to-redemption funnel, cost per view and engagement.",
  },
];

/** §7 — a teaser. The full six live on the package catalogue. */
const PACKAGES = [
  {
    name: "SponsorX Test Drive",
    price: "$750",
    blurb: "Three athletes, one activation each, basic report.",
    detail: "The low-friction first campaign.",
  },
  {
    name: "Community Campaign",
    price: "~$5,000",
    blurb: "10–15 athletes, premium content, BTG feature, fan reward.",
    detail: "Mid-level, multi-athlete.",
    featured: true,
  },
  {
    name: "Season Partner",
    price: "$15K–$30K+",
    blurb: "Recurring content, events, rewards and category exclusivity.",
    detail: "Own the category for a season.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ================================================== hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-primary/18 blur-[120px]"
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:py-24">
          <div>
            <Logo className="h-14" />
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Connecting brands. Athletes. Fans. Results.
            </p>

            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Maximize Impact.
              <br />
              Measure Results.
              <br />
              <span className="text-accent">Reward Fans.</span>
            </h1>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
              The all-in-one sponsorship platform for BTG Sports Group and our
              partners. Real athletes, standardized campaigns, and delivery you
              can check.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="#for-sponsors"
                className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
              >
                I&rsquo;m a Sponsor
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Learn More
              </Link>
            </div>
          </div>

          {/* Hero visual. The mockup uses a cut-out athlete photograph; that
              asset is not in the repo, so this is a placeholder treatment
              rather than an invented image. */}
          <div className="relative">
            <div className="relative grid aspect-4/5 place-items-center overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface-2 via-surface to-bg">
              <div
                aria-hidden="true"
                className="absolute inset-x-8 bottom-0 h-2/3 rounded-t-full bg-primary/12 blur-3xl"
              />
              <div className="relative text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-faint">
                  BTG
                </p>
                <p className="mt-1 text-7xl font-bold tracking-tighter text-muted/40">
                  23
                </p>
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-faint">
                athlete photography pending
              </p>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------- stats bar */}
        <div className="mx-auto w-full max-w-6xl px-6">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl border border-b-0 border-line bg-line sm:grid-cols-4">
            {networkStats.map((s, i) => (
              <div
                key={s.label}
                title={s.source}
                className={`sx-animate ${DELAYS[i]} bg-surface px-5 py-5 text-center`}
              >
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-2xl font-semibold tracking-tight">
                    <CountUp value={s.value} prefix={s.prefix} />
                  </span>
                  <span className="mt-1 block text-[11px] text-muted">
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] text-faint">
            Live network counts — Postgres · MetricDaily · RewardEvent
          </p>
        </div>
      </section>

      {/* Pre-launch only — delete with the component. */}
      <BuildPreview />

      {/* ================================================== how it works */}
      <section
        id="how-it-works"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      >
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="mt-2 max-w-lg text-sm text-muted">
          A managed marketplace. BTG handles matching, pricing and approvals —
          you approve the work and read the results.
        </p>

        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-xl border border-line bg-surface p-5"
            >
              <span className="text-[11px] font-semibold tracking-widest text-primary-soft">
                {s.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ================================================== for sponsors */}
      <section
        id="for-sponsors"
        className="scroll-mt-20 border-y border-line bg-surface/40 py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                For sponsors
              </h2>
              <p className="mt-2 max-w-lg text-sm text-muted">
                Standardized packages, priced up front. Start small, see the
                numbers, then scale the ones that worked.
              </p>
            </div>
            <Link
              href="/packages"
              className="text-xs font-medium text-accent hover:underline"
            >
              All six packages →
            </Link>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PACKAGES.map((p) => (
              <div
                key={p.name}
                className={[
                  "flex flex-col rounded-xl border bg-surface p-6",
                  p.featured ? "border-primary/50" : "border-line",
                ].join(" ")}
              >
                {p.featured && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary-soft">
                    Most popular
                  </span>
                )}
                <h3 className="text-sm font-semibold tracking-tight">
                  {p.name}
                </h3>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {p.price}
                </p>
                <p className="mt-1 text-[11px] text-faint">{p.detail}</p>
                <p className="mt-4 flex-1 text-xs leading-relaxed text-muted">
                  {p.blurb}
                </p>
                <div className="mt-6">
                  <Link
                    href="/packages"
                    className={[
                      "block rounded-lg px-4 py-2.5 text-center text-xs font-medium transition-colors",
                      p.featured
                        ? "bg-primary text-cta-ink hover:bg-primary-soft"
                        : "border border-line text-text hover:bg-surface-2",
                    ].join(" ")}
                  >
                    Request a brief
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[11px] text-faint">
            Phase 1 is a managed marketplace — you submit a brief and BTG builds
            the campaign. No self-service checkout.
          </p>
        </div>
      </section>

      {/* ================================================== for athletes */}
      <section
        id="for-athletes"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      >
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              For athletes
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Join as a SponsorX Content Partner. Non-exclusive, so your own
              deals stay yours — take the paid jobs that fit and skip the ones
              that don&rsquo;t.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                "Set your own rate for each job type",
                "Accept or decline every campaign — nothing is automatic",
                "Guardian-managed path for athletes under 18",
                "See what you have earned and where it stands",
              ].map((li) => (
                <li key={li} className="flex gap-2.5 text-xs text-muted">
                  <span className="mt-0.5 text-accent" aria-hidden="true">
                    ✓
                  </span>
                  <span>{li}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/join"
                className="rounded-lg bg-accent px-5 py-2.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
              >
                Join the Athlete Network
              </Link>
              <Link
                href="/athlete"
                className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Athlete portal
              </Link>
            </div>
          </div>

          {/* §5 job catalogue, as a sponsor-neutral range. */}
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Standard jobs
            </p>
            <ul className="mt-4 divide-y divide-line-soft">
              {[
                ["SX-01", "Story Drop", "$25–$50"],
                ["SX-02", "Sponsored Post", "$50–$100"],
                ["SX-03", "Athlete Reel", "$75–$150"],
                ["SX-04", "Product Experience", "$125–$250"],
                ["SX-05", "Local Appearance", "$150–$300"],
                ["SX-06", "Content Day", "$150–$350"],
                ["SX-07", "Monthly Ambassador", "$300–$750+"],
              ].map(([code, name, pay]) => (
                <li key={code} className="flex items-center gap-3 py-2.5">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                    {code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {name}
                  </span>
                  <span className="text-xs tabular-nums text-muted">{pay}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[10px] leading-relaxed text-faint">
              Launch ranges. Your rate depends on your audience, the rights
              requested, exclusivity and production.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================== proof */}
      <section className="border-t border-line bg-surface/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Campaigns on record
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            §9.1 requires proof slots on this page. They stay empty until the
            first pilot campaigns close — real numbers or nothing.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-dashed border-line p-6"
              >
                <div className="h-2 w-16 rounded bg-line" />
                <div className="mt-4 h-2 w-full rounded bg-line-soft" />
                <div className="mt-2 h-2 w-4/5 rounded bg-line-soft" />
                <p className="mt-6 text-[10px] uppercase tracking-wider text-faint">
                  Case study slot {i}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================== closing CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface px-8 py-12 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-full size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[100px]"
          />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight">
              Start with one campaign.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Three athletes, one activation each, a report you can read. $750.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/packages"
                className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
              >
                Request a brief
              </Link>
              <Link
                href="/join"
                className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Join as an athlete
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
