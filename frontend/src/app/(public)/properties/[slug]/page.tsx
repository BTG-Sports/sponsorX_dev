import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { HeroBand } from "@/components/hero";
import { Badge, Card, SectionHeading, SourceLabel } from "@/components/ui";
import { INVENTORY_COPY, money, property } from "@/lib/fixtures";
import { resolveBack } from "@/lib/back";
import { edgeHeadersFrom } from "@/server/edge";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** The fixture slugs the demo links use — the only ones that fall back to
 *  the sample property. Any other slug is a real property or a 404. */
const DEMO_SLUGS = new Set(["btg-sports-talk", "demo-property"]);

type PublicProperty = {
  slug: string;
  name: string;
  kind: string;
  city: string | null;
  stateCode: string | null;
  roster: { slug: string; displayName: string; sport: string; position: string | null }[];
  /** Public athletes not named — minors, or age not confirmed (QA pass 9). */
  notListed: number;
  rosterTruncated: boolean;
};

/** GET /public/properties/:slug. "missing" is the API saying no such
 *  property; "unavailable" is not being able to ask (outage, 5xx, timeout,
 *  rate limit). The two used to look the same, so an outage told visitors a
 *  real property didn't exist (QA pass 8, F-12). A public page degrades — it
 *  never throws. */
type Lookup = { status: "found"; property: PublicProperty } | { status: "missing" } | { status: "unavailable" };

async function fetchPublicProperty(slug: string): Promise<Lookup> {
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return { status: "missing" };
  try {
    const res = await fetch(`${API_URL}/api/v1/public/properties/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: edgeHeadersFrom(await headers()),
    });
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) return { status: "unavailable" };
    return { status: "found", property: ((await res.json()) as { property: PublicProperty }).property };
  } catch {
    return { status: "unavailable" };
  }
}

/** Static stagger classes (globals.css) — index by clamped position. */
const STAGGER = [
  "sx-delay-1",
  "sx-delay-2",
  "sx-delay-3",
  "sx-delay-4",
  "sx-delay-5",
] as const;

/* --------------------------------------------------------------------------
   Property Profile — §9 screen 5, mockup screen 5.

   A commercial profile for a team, school, event or media property, with its
   sponsorship opportunities. The mockup shows BTG Sports Talk; the roster
   panel is added because §4 lets property-affiliated athletes be activated
   individually or through the property.

   Cover art is a placeholder treatment — the real artwork is not in the repo.

   LIVE (P2-FE-01). A real slug renders the property from
   GET /public/properties/:slug: name, kind, place and its public adult
   athletes — minors are counted, never named. No price or inventory: Phase 1
   is managed (§17), so the page's one action is a brief. The demo slugs keep
   the sample property; any other unknown slug is a 404, not the sample.
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

  const live = DEMO_SLUGS.has(slug) ? null : await fetchPublicProperty(slug);
  if (live?.status === "found") return <LiveProfile p={live.property} back={back} />;
  if (live?.status === "missing") notFound();
  if (live?.status === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <BackLink target={back} />
        <Card className="mt-6">
          <h1 className="text-lg font-semibold tracking-tight">This profile is temporarily unavailable</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            We couldn&rsquo;t load it just now. Try again in a minute — or
            send BTG a brief and a person will follow up.
          </p>
          <Link
            href="/brief"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-[11px] font-medium text-cta-ink hover:bg-primary-soft"
          >
            Submit a brief
          </Link>
        </Card>
      </div>
    );
  }

  const p = property; // fixtures: the demo slugs resolve to the one sample

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
          <div className="absolute inset-0 bg-gradient-to-br from-[#103a4e] via-[#0d2233] to-[#0a0c10]" />
          <div
            aria-hidden="true"
            className="absolute -left-10 bottom-0 size-64 rounded-full bg-danger/25 blur-[80px]"
          />
          <div className="relative grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight text-on-media/80">
                BTG SPORTS
              </p>
              <p className="text-lg font-bold leading-tight tracking-tight text-on-media/80">
                TALK
              </p>
            </div>
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-on-media/25">
            cover art pending
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ stat band */}
      <HeroBand border="border-property/30" className="mt-8 sx-animate">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {p.stats.map((s, i) => (
            /* dt before dd in the markup (axe definition-list); the value
               still reads first via flex order. */
            <div
              key={s.label}
              className={["sx-animate flex flex-col", STAGGER[Math.min(i, 4)]].join(" ")}
            >
              <dt className="order-2 mt-1 text-[10px] leading-tight text-muted">
                {s.label}
              </dt>
              <dd className="order-1">
                <span className="block text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{s.value}</span>
              </dd>
              <dd className="order-3 mt-2">
                <SourceLabel source={s.source} />
              </dd>
            </div>
          ))}
        </dl>
      </HeroBand>

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
                  className="rounded-lg bg-primary px-5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
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
        Sample property — requested slug{" "}
        <code className="font-mono">{slug}</code>. Real properties render
        from Postgres at their own slug.
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  TEAM: "Team",
  SCHOOL: "School",
  EVENT: "Event",
  MEDIA: "Media property",
  VIRTUAL: "Virtual property",
  AGENCY: "Athlete agency",
};

function LiveProfile({ p, back }: { p: PublicProperty; back: ReturnType<typeof resolveBack> }) {
  const place = [p.city, p.stateCode].filter(Boolean).join(", ");
  const listed = p.roster.length;
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <BackLink target={back} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        <p className="mt-1 text-xs text-muted">
          {KIND_LABEL[p.kind] ?? p.kind}
          {place ? ` · ${place}` : ""}
        </p>
      </div>

      <HeroBand border="border-property/30" className="mt-8 sx-animate">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-semibold tracking-tight">Sponsor {p.name} through BTG</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Tell BTG what you want to achieve. BTG matches the athletes,
              checks category conflicts and sends one invoice — no checkout
              (§17).
            </p>
          </div>
          <Link
            href="/brief"
            className="shrink-0 rounded-lg bg-primary px-5 py-2 text-center text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Submit a brief
          </Link>
        </div>
      </HeroBand>

      <section className="mt-10">
        <SectionHeading
          title="Property roster"
          hint="§4 — these athletes can be activated individually or through the property"
        />
        {listed === 0 ? (
          <Card>
            <p className="text-xs leading-relaxed text-muted">
              {p.notListed > 0
                ? `${p.notListed} athlete${p.notListed === 1 ? "" : "s"} from this property ${p.notListed === 1 ? "is" : "are"} on the platform. Athletes are named here only once they're confirmed as adults.`
                : "No athletes from this property are on the platform yet."}
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {p.roster.map((a) => (
                <div
                  key={a.slug}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[10px] font-semibold text-muted">
                    {a.displayName
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{a.displayName}</span>
                    <span className="block truncate text-[11px] text-faint">
                      {[a.sport, a.position].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {p.notListed > 0 && (
              <p className="mt-3 text-[11px] text-faint">
                {p.notListed} more athlete{p.notListed === 1 ? "" : "s"} on this roster{" "}
                {p.notListed === 1 ? "isn't" : "aren't"} listed here — minors, and anyone
                whose age isn&rsquo;t confirmed, are never named publicly.
              </p>
            )}
          </>
        )}
      </section>

      <p className="mt-8 text-[10px] text-faint">
        From Postgres. Athletes shown are public on the platform; contact
        details and prices are never on this page.
      </p>
    </div>
  );
}
