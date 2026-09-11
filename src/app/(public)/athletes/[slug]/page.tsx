import { BackLink } from "@/components/back-link";
import { HeroBand } from "@/components/hero";
import { Badge, Card, SourceLabel } from "@/components/ui";
import { INVENTORY_COPY, athletePublic } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";

/** Static stagger classes (globals.css) — index by clamped position. */
const STAGGER = [
  "sx-delay-1",
  "sx-delay-2",
  "sx-delay-3",
  "sx-delay-4",
  "sx-delay-5",
] as const;

/* --------------------------------------------------------------------------
   Athlete Profile — §9 screen 5, mockup screen 6.

   This is the SPONSOR-FACING profile: Follow, Request Partnership, and
   inventory at sponsor prices. It is not the Athlete Portal (§9 screen 6,
   built at /athlete) — the mockup labels this one "Athlete Profile", which is
   easy to confuse.

   Prices here are what a sponsor pays. AthleteRate.amount — what the athlete
   is paid — must never render on this page (guide §04, tested per §30).
   -------------------------------------------------------------------------- */

const TABS = ["Overview", "Inventory", "Media", "Performance"] as const;

const ICONS = {
  post: "M4 4h16v16H4V4Zm0 12 4-4 3 3 3-3 6 6",
  reel: "M4 4h16v16H4V4Zm0 5h16M9 4v5m-5 4 6 4v-8l-6 4Z",
  story: "M7 4h10v16H7V4Zm-4 3v10m18-10v10",
  event: "M4 5h16v16H4V5Zm0 5h16M9 3v4m6-4v4",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z",
} as const;

function InvIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function VerifiedTick() {
  return (
    <span title="Verified athlete" className="inline-flex text-primary-soft">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="m12 2 2.4 1.8 3-.3 1 2.8 2.6 1.5-.9 2.9.9 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l.9-2.9L3 10.4l2.6-1.5 1-2.8 3 .3L12 2Z"
        />
        <path
          fill="var(--sx-bg)"
          d="m10.9 15.2-2.8-2.8 1.2-1.2 1.6 1.6 3.9-3.9 1.2 1.2-5.1 5.1Z"
        />
      </svg>
    </span>
  );
}

export default async function AthleteProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "mk-athletes");
  const a = athletePublic; // fixtures: one athlete, any slug resolves to it

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <BackLink target={back} />

      {/* ---------------------------------------------------- header row */}
      <div className="mt-4 grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
        {/* Portrait. Real photography comes from the R2 public bucket. */}
        <div className="relative aspect-3/4 overflow-hidden rounded-xl border border-line">
          <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-bg" />
          <div className="relative grid h-full place-items-center">
            <span className="text-3xl font-bold tracking-tight text-muted/30">
              {a.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
          </div>
          <p className="absolute bottom-2 left-0 right-0 text-center text-[9px] text-faint">
            photo pending
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  {a.name}
                </h1>
                {a.verified && <VerifiedTick />}
              </div>
              <p className="mt-1 text-xs text-muted">
                {a.sport} | {a.position}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{a.meta}</p>
            </div>
            <button
              type="button"
              title="Follow — not wired"
              className="rounded-lg bg-primary px-5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
            >
              Follow
            </button>
          </div>

          {/* ------------------------------------------------ stat band */}
          <HeroBand border="border-athlete/30" className="mt-5 sx-animate">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              {a.stats.map((s, i) => (
                <div
                  key={s.label}
                  className={["sx-animate", STAGGER[Math.min(i, 4)]].join(" ")}
                >
                  <dd className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                    {s.value}
                  </dd>
                  <dt className="mt-1 text-[10px] leading-tight text-muted">
                    {s.label}
                  </dt>
                  <div className="mt-1.5">
                    <SourceLabel source={s.source} />
                  </div>
                </div>
              ))}
            </dl>
          </HeroBand>
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="mt-8 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t, i) => (
          <span
            key={t}
            title={i === 0 ? undefined : "Not built yet"}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium",
              i === 0
                ? "bg-primary/15 text-primary-soft"
                : "cursor-default text-faint",
            ].join(" ")}
          >
            {t}
          </span>
        ))}
      </div>

      {/* --------------------------------------------- inventory + about */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        {/* min-w-0: the implicit single column below lg must be allowed to
            shrink under the inventory rows' min-content, or the page widens
            past 360 (P1-QA-03). */}
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            Available Inventory
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {a.inventory.map((it) => (
                <li
                  key={it.jobId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <InvIcon name={it.icon} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {it.label}
                  </span>
                  {it.state !== "ACTIVE" && (
                    <Badge tone="warn">{INVENTORY_COPY[it.state]}</Badge>
                  )}
                  <Badge tone="neutral">{it.jobId}</Badge>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
                    {it.price}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <button
            type="button"
            title="Opens a CampaignBrief with this athlete attached — not wired"
            className="mt-4 w-full rounded-lg bg-primary py-2.5 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
          >
            Request Partnership
          </button>

          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Sponsor prices, mapped to the SX job catalogue (§5). What the
            athlete is paid is a different number and does not appear here —
            guide §04, enforced as a §30 test.
          </p>
        </section>

        <div className="min-w-0 space-y-5">
          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-tight">About</h2>
            <Card>
              <p className="text-xs leading-relaxed text-muted">{a.about}</p>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              Interests
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {a.interests.map((i) => (
                <span
                  key={i}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted"
                >
                  {i}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              Restrictions
            </h2>
            <Card>
              <p className="text-[11px] leading-relaxed text-muted">
                Category conflicts are checked before an invitation is sent
                (§26). Nothing is declared for this athlete yet.
              </p>
            </Card>
          </section>
        </div>
      </div>

      <p className="mt-8 text-[10px] text-faint">
        Fixture data — requested slug <code className="font-mono">{slug}</code>.
      </p>
    </div>
  );
}
