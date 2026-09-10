import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, Card, SectionHeading, SourceLabel } from "@/components/ui";
import { INVENTORY_COPY, money, property } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";

/* --------------------------------------------------------------------------
   Property Profile — §9 screen 5, mockup screen 5.

   A commercial profile for a team, school, event or media property, with its
   sponsorship opportunities. The mockup shows BTG Sports Talk; the roster
   panel is added because §4 lets property-affiliated athletes be activated
   individually or through the property.

   Cover art is a placeholder treatment — the real artwork is not in the repo.
   -------------------------------------------------------------------------- */

export default async function PropertyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "mk-media");
  const p = property; // fixtures: one property, any slug resolves to it

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <BackLink target={back} />

      {/* ------------------------------------------------ header + cover */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-xs text-muted">{p.subtitle}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {p.formats.map((f, i) => (
              <span
                key={f}
                className={[
                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                  i === 0
                    ? "bg-primary/15 text-primary-soft"
                    : "bg-surface-2 text-muted",
                ].join(" ")}
              >
                {f}
              </span>
            ))}
          </div>

          <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted">
            {p.about}
          </p>
        </div>

        {/* Cover art. Real artwork comes from the R2 public bucket. */}
        <div className="relative aspect-16/9 overflow-hidden rounded-xl border border-line lg:aspect-4/3">
          <div className="absolute inset-0 bg-gradient-to-br from-[#3a1220] via-[#241026] to-[#0e1016]" />
          <div
            aria-hidden="true"
            className="absolute -left-10 bottom-0 size-64 rounded-full bg-danger/25 blur-[80px]"
          />
          <div className="relative grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight text-white/80">
                BTG SPORTS
              </p>
              <p className="text-lg font-bold leading-tight tracking-tight text-white/80">
                TALK
              </p>
            </div>
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/25">
            cover art pending
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ stat row */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {p.stats.map((s) => (
          <div key={s.label} className="bg-surface px-4 py-4">
            <dd className="text-xl font-semibold tabular-nums tracking-tight">
              {s.value}
            </dd>
            <dt className="mt-1 text-[10px] leading-tight text-muted">
              {s.label}
            </dt>
            <div className="mt-2">
              <SourceLabel source={s.source} />
            </div>
          </div>
        ))}
      </dl>

      {/* --------------------------------------- sponsorship opportunities */}
      <section className="mt-10">
        <SectionHeading
          title="Sponsorship Opportunities"
          hint="Phase 1 is managed — Select opens a brief, it does not check out (§17)"
        />
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {p.opportunities.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold tracking-tight">
                      {o.name}
                    </p>
                    {o.state !== "ACTIVE" && (
                      <Badge tone="warn">{INVENTORY_COPY[o.state]}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{o.detail}</p>
                </div>
                <span className="text-base font-semibold tabular-nums tracking-tight">
                  {money(o.price)}
                </span>
                <button
                  type="button"
                  title="Adds this opportunity to a CampaignBrief — not wired"
                  className="rounded-lg bg-primary px-5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* ---------------------------------------------------------- roster */}
      <section className="mt-10">
        <SectionHeading
          title="Property roster"
          hint="§4 — these athletes can be activated individually or through the property"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {p.roster.map((a) => (
            <Link
              key={a.slug}
              href={`/athletes/${a.slug}?from=property`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[10px] font-semibold text-muted">
                {a.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {a.name}
                </span>
                <span className="block truncate text-[11px] text-faint">
                  {a.sport}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[10px] text-faint">
        Fixture data — requested slug{" "}
        <code className="font-mono">{slug}</code>. One property exists until
        Prisma lands; guide V2 §03 adds the <code className="font-mono">Property</code>{" "}
        model that V1 omitted.
      </p>
    </div>
  );
}
