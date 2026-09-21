import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { networkStats } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Landing content — the 2D chapters that frame the centered 3D ball (P1-ART-08).

   Six full-viewport sections matching landing-chapters.ts. Real, server-
   rendered DOM (SEO + the permanent fallback when the 3D scene doesn't run).
   The middle column is intentionally clear on desktop: the fixed canvas behind
   floats the ball there. All copy is ported from the previous home page and
   @/lib/fixtures — no invented claims; stats keep their provenance (title=source).
   Design: docs/superpowers/specs/2026-09-22-landing-3d-scrollytelling-design.md
   -------------------------------------------------------------------------- */

/** §39's operating loop, written for a sponsor (basketball chapter). */
const STEPS = [
  { n: "01", title: "Tell us the goal", body: "Objective, budget, market and category. One brief, no media plan required." },
  { n: "02", title: "We match athletes", body: "Selected on engagement, content quality, reliability and audience fit — not follower count." },
  { n: "03", title: "Athletes activate", body: "Content, appearances and QR-backed fan rewards, each with its own tracking code." },
  { n: "04", title: "You get the numbers", body: "Verified delivery, scan-to-redemption funnel, cost per view and engagement." },
];

/** §7 teaser — the full six live on the package catalogue (baseball chapter). */
const PACKAGES = [
  { name: "SponsorX Test Drive", price: "$750", blurb: "Three athletes, one activation each, basic report.", detail: "The low-friction first campaign." },
  { name: "Community Campaign", price: "~$5,000", blurb: "10–15 athletes, premium content, BTG feature, fan reward.", detail: "Mid-level, multi-athlete.", featured: true },
  { name: "Season Partner", price: "$15K–$30K+", blurb: "Recurring content, events, rewards and category exclusivity.", detail: "Own the category for a season." },
];

/** §5 job catalogue as a sponsor-neutral range (soccer / athlete chapter). */
const JOBS: [string, string, string][] = [
  ["SX-01", "Story Drop", "$25–$50"],
  ["SX-02", "Sponsored Post", "$50–$100"],
  ["SX-03", "Athlete Reel", "$75–$150"],
  ["SX-04", "Product Experience", "$125–$250"],
  ["SX-05", "Local Appearance", "$150–$300"],
  ["SX-06", "Content Day", "$150–$350"],
  ["SX-07", "Monthly Ambassador", "$300–$750+"],
];

/* ---- small presentational helpers -------------------------------------- */

function Section({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative flex min-h-screen scroll-mt-16 items-center py-24 ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-6">{children}</div>
    </section>
  );
}

/** Two-side layout that leaves the centre clear for the ball on desktop. */
function Framed({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_22rem_minmax(0,1fr)]">
      <div className="space-y-5">{left}</div>
      <div aria-hidden="true" className="hidden lg:block" />
      <div className="space-y-5">{right}</div>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, tone }: { children: React.ReactNode; tone: "blue" | "orange" }) {
  const color = tone === "orange" ? "text-accent" : "text-primary-soft";
  return (
    <p className={`flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] ${color}`}>
      <span className={`h-px w-6 ${tone === "orange" ? "bg-accent" : "bg-primary-soft"}`} aria-hidden="true" />
      {children}
    </p>
  );
}

/* ---- the page ---------------------------------------------------------- */

export function LandingContent() {
  return (
    <div className="relative z-10">
      {/* ===== 0 · Hero — orb ================================================= */}
      <Section id="hero" className="text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Connecting brands. Athletes. Fans. Results.
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Maximize Impact.
            <br />
            Measure Results.
            <br />
            <span className="text-accent">Reward Fans.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted">
            The all-in-one sponsorship platform for BTG Sports Group and our
            partners. Real athletes, standardized campaigns, and delivery you can
            check.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/packages"
              className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
            >
              I&rsquo;m a Sponsor
            </Link>
            <Link
              href="#basketball"
              className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
            >
              See how it works
            </Link>
          </div>
          <p className="mt-14 text-[10px] uppercase tracking-[0.18em] text-faint">
            Scroll — one network, every sport ↓
          </p>
        </div>
      </Section>

      {/* ===== 1 · Soccer — the Athlete Network + live stats ================= */}
      <Section id="soccer">
        <Framed
          left={
            <>
              <Eyebrow tone="blue">Chapter 01 · Soccer</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight">One network. Every sport.</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                Join as a SponsorX Content Partner. Non-exclusive, so your own
                deals stay yours — take the paid jobs that fit and skip the ones
                that don&rsquo;t.
              </p>
              <ul className="space-y-2.5">
                {[
                  "Set your own rate for each job type",
                  "Accept or decline every campaign — nothing is automatic",
                  "Guardian-managed path for athletes under 18",
                  "See what you have earned and where it stands",
                ].map((li) => (
                  <li key={li} className="flex gap-2.5 text-xs text-muted">
                    <span className="mt-0.5 text-accent" aria-hidden="true">✓</span>
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href="/join" className="rounded-lg bg-accent px-5 py-2.5 text-xs font-medium text-cta-ink transition-opacity hover:opacity-90">
                  Join the Athlete Network
                </Link>
                <Link href="/athlete" className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2">
                  Athlete portal
                </Link>
              </div>
            </>
          }
          right={
            <>
              <Panel>
                <dl className="grid grid-cols-2 gap-4">
                  {networkStats.map((s) => (
                    <div key={s.label} title={s.source}>
                      <dt className="sr-only">{s.label}</dt>
                      <dd>
                        <span className="block text-2xl font-semibold tracking-tight">
                          <CountUp value={s.value} prefix={s.prefix} />
                        </span>
                        <span className="mt-1 block text-[11px] text-muted">{s.label}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-[10px] text-faint">
                  Live network counts — Postgres · MetricDaily · RewardEvent
                </p>
              </Panel>
              <Panel>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Standard jobs</p>
                <ul className="mt-3 divide-y divide-line-soft">
                  {JOBS.map(([code, name, pay]) => (
                    <li key={code} className="flex items-center gap-3 py-2">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">{code}</span>
                      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
                      <span className="text-xs tabular-nums text-muted">{pay}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[10px] leading-relaxed text-faint">
                  Launch ranges. Your rate depends on your audience, the rights requested, exclusivity and production.
                </p>
              </Panel>
            </>
          }
        />
      </Section>

      {/* ===== 2 · Basketball — how matching works ========================== */}
      <Section id="basketball">
        <Framed
          left={
            <>
              <Eyebrow tone="orange">Chapter 02 · Basketball</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight">Matching, done for you.</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                A managed marketplace. BTG handles matching, pricing and approvals
                — you approve the work and read the results.
              </p>
              <Panel>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Why it works</p>
                <p className="mt-2 text-sm font-semibold tracking-tight">Fit, not fame.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Reliability, content quality and real audience overlap decide the
                  shortlist — so activations actually land.
                </p>
              </Panel>
            </>
          }
          right={
            <ol className="grid gap-4 sm:grid-cols-2">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-xl border border-line bg-surface/70 p-4 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold tracking-widest text-accent">{s.n}</span>
                  <h3 className="mt-2 text-sm font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          }
        />
      </Section>

      {/* ===== 3 · Baseball — packages ====================================== */}
      <Section id="baseball">
        <Framed
          left={
            <>
              <Eyebrow tone="blue">Chapter 03 · Baseball</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight">Packages, priced up front.</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                Standardized packages, priced up front. Start small, see the
                numbers, then scale the ones that worked.
              </p>
              <Link href="/packages" className="inline-block text-xs font-medium text-primary-soft hover:underline">
                All six packages →
              </Link>
              <p className="max-w-md text-[11px] leading-relaxed text-faint">
                Phase 1 is a managed marketplace — you submit a brief and BTG
                builds the campaign. No self-service checkout.
              </p>
            </>
          }
          right={
            <div className="space-y-4">
              {PACKAGES.map((p) => (
                <div
                  key={p.name}
                  className={`rounded-xl border bg-surface/70 p-5 backdrop-blur-sm ${p.featured ? "border-primary/50" : "border-line"}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold tracking-tight">{p.name}</h3>
                    <p className="text-2xl font-semibold tracking-tight">{p.price}</p>
                  </div>
                  {p.featured && (
                    <span className="mt-2 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary-soft">
                      Most popular
                    </span>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-muted">{p.blurb}</p>
                  <p className="mt-1 text-[11px] text-faint">{p.detail}</p>
                </div>
              ))}
            </div>
          }
        />
      </Section>

      {/* ===== 4 · Football — results & fan rewards ========================= */}
      <Section id="football">
        <Framed
          left={
            <>
              <Eyebrow tone="orange">Chapter 04 · Football</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight">Results. Fans rewarded.</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                Verified delivery, a scan-to-redemption funnel, cost per view and
                engagement — plus QR-backed fan rewards redeemed at events, each
                with its own tracking code.
              </p>
              <Panel>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Fan rewards</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Fans redeem at events via QR — no login — and every scan flows
                  into the sponsor&rsquo;s report.
                </p>
              </Panel>
            </>
          }
          right={
            <>
              <h3 className="text-sm font-semibold tracking-tight">Campaigns on record</h3>
              <p className="text-xs text-muted">
                Proof slots stay empty until the first pilot campaigns close — real
                numbers or nothing.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-dashed border-line p-4">
                    <div className="h-2 w-12 rounded bg-line" />
                    <div className="mt-3 h-2 w-full rounded bg-line-soft" />
                    <div className="mt-2 h-2 w-4/5 rounded bg-line-soft" />
                    <p className="mt-5 text-[10px] uppercase tracking-wider text-faint">Case study slot {i}</p>
                  </div>
                ))}
              </div>
            </>
          }
        />
      </Section>

      {/* ===== 5 · Finale — closing CTA (SiteFooter follows) ================ */}
      <Section id="finale" className="text-center">
        <div className="mx-auto max-w-xl">
          <Eyebrow tone="orange">
            <span className="mx-auto">The SponsorX loop</span>
          </Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Start with one campaign.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Three athletes, one activation each, a report you can read. $750.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/packages" className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft">
              Request a brief
            </Link>
            <Link href="/join" className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2">
              Join as an athlete
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
