import { Badge, Card } from "@/components/ui";
import { initials } from "@/components/hero";
import { ClaimProfile } from "@/components/claim-profile";
import { edgeHeadersFrom } from "@/server/edge";
import { headers } from "next/headers";

/* --------------------------------------------------------------------------
   P1-FE-28 / P9-FE-08 — a FEATURED athlete's public page, from
   GET /public/athletes/:slug. Deliberately unlike the ACTIVE profile: no
   Follow, no Request Partnership, no inventory, no prices — a featured
   athlete holds no rates and receives no invitations (P9-BE-11). The page is
   editorial, says so at the top, and its only action is the claim.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type PublicAthlete = {
  slug: string;
  displayName: string;
  sport: string;
  position: string | null;
  school: string | null;
  stateCode: string | null;
  featured: boolean;
  claimable: boolean;
};

/** null = no FEATURED/ACTIVE profile at this slug — or the lookup failed.
 *  This page is a QR destination that renders without the API today, so a
 *  failed lookup degrades to the existing profile view rather than an error
 *  page; the visitor's address is forwarded so the API's rate limit counts
 *  them, not this server (P8-SEC-03). */
export async function fetchPublicAthlete(slug: string): Promise<PublicAthlete | null> {
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/api/v1/public/athletes/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: edgeHeadersFrom(await headers()),
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicAthlete;
  } catch {
    return null;
  }
}

export function FeaturedProfile({ a }: { a: PublicAthlete }) {
  const meta = [a.sport, a.position, a.school, a.stateCode].filter(Boolean).join(" · ");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Card className="relative overflow-hidden border-dashed border-next/40">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-next opacity-[0.12] blur-[60px]" />
          <div className="relative flex flex-wrap items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-dashed border-next/50 bg-next/[0.06] text-lg font-bold text-next">
              {initials(a.displayName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{a.displayName}</h1>
                <Badge tone="neutral">Featured</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{meta}</p>
            </div>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-medium">This is an editorial profile</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            SponsorX NEXT student journalists wrote about {a.displayName}. Being featured is not being represented:{" "}
            {a.displayName.split(" ")[0]} hasn&rsquo;t joined SponsorX, isn&rsquo;t available for sponsorship, and has no rates
            here. Nothing on this page is an endorsement.
          </p>
        </Card>
      </div>
      <div className="min-w-0">{a.claimable && <ClaimProfile slug={a.slug} name={a.displayName} />}</div>
    </div>
  );
}
