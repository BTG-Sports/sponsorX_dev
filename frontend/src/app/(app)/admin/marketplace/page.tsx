import Link from "next/link";

import { MopsListingQueue } from "@/components/mops-listing-queue";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Card, SectionHeading, StatTile } from "@/components/ui";
import { isOverdue, shortId, usd, waitLabel, type ApiListing, type ApiMarketplaceOrder } from "@/lib/marketplace-ops-live";
import { ORG_TYPE_COPY, type ApiOnboarding } from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Marketplace operations — 2S7-FE-02. Every marketplace exception BTG acts
   on, in one place. BTG_ADMIN and SUPER_ADMIN.

   Reads, in parallel:
     GET /onboarding                                  (PENDING_REVIEW, the API's default)
     GET /listings?state=PENDING_APPROVAL             (decided inline: POST /listings/:id/decision)
     GET /marketplace-orders?state=PENDING_APPROVAL   (each opens /admin/marketplace/orders/<id>)
   Counts are the lengths of those arrays — the API has no counts route.

   Honest gaps: disputes, failed payments and payout exceptions have no model
   or route (no payment provider yet), so they show one plain "not tracked
   yet" note and no numbers. Orders carry only sponsorId — no sponsor name.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

type Queue<T> = { rows: T[] } | { forbidden: true };

async function read<T>(path: string, key: string): Promise<Queue<T>> {
  const res = await apiFetch(path);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error(`The console couldn't load ${path} (${res.status}).`);
  return { rows: ((await res.json()) as Record<string, T[]>)[key] ?? [] };
}

const countOf = (q: Queue<unknown>) => ("rows" in q ? String(q.rows.length) : "—");

function Forbidden() {
  return <p className="px-5 py-4 text-xs text-muted">Outside your role — the API refused this queue.</p>;
}
function Clear({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-xs text-faint">{children}</p>;
}

export default async function MarketplaceOpsPage() {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Marketplace operations" roles={lacking} />;

  const [onboarding, listings, orders] = await Promise.all([
    read<ApiOnboarding>("/onboarding", "onboardings"),
    read<ApiListing>("/listings?state=PENDING_APPROVAL", "listings"),
    read<ApiMarketplaceOrder>("/marketplace-orders?state=PENDING_APPROVAL", "orders"),
  ]);
  const now = new Date().getTime();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Marketplace operations</h1>
          <p className="mt-1 text-xs text-muted">Every exception in one place. Act on it here; each action is recorded against the reviewer.</p>
        </div>
        <Link href="/admin/commission" className="text-xs text-primary hover:underline">
          Commission rules →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Properties awaiting review" value={countOf(onboarding)} />
        <StatTile label="Listings awaiting approval" value={countOf(listings)} />
        <StatTile label="Orders awaiting approval" value={countOf(orders)} />
      </div>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading
            title="Property applications"
            hint="Submitted and waiting for BTG, oldest first."
            action={
              <Link href="/admin/onboarding" className="text-[11px] text-primary hover:underline">
                All applications →
              </Link>
            }
          />
        </div>
        {"forbidden" in onboarding ? (
          <Forbidden />
        ) : onboarding.rows.length === 0 ? (
          <Clear>Nothing waiting — new applications arrive here when an organisation submits the wizard.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {onboarding.rows.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/onboarding/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.orgName}</span>
                    <span className="block text-[11px] text-muted">
                      {ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}
                      {o.stateCode ? ` · ${o.stateCode}` : ""}
                    </span>
                  </span>
                  <span className={`text-[11px] tabular-nums ${isOverdue(o.submittedAt, now) ? "text-warn" : "text-faint"}`}>
                    waiting {waitLabel(o.submittedAt, now) ?? "—"} · Review →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading title="Listings awaiting approval" hint="Approving publishes the listing. Blockers must be cleared by the property first." />
        </div>
        {"forbidden" in listings ? (
          <Forbidden />
        ) : listings.rows.length === 0 ? (
          <Clear>No listings to review.</Clear>
        ) : (
          <MopsListingQueue listings={listings.rows} now={now} />
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading title="Orders awaiting approval" hint="Held by policy — the reasons are the API's own. Open one to see its split and decide." />
        </div>
        {"forbidden" in orders ? (
          <Forbidden />
        ) : orders.rows.length === 0 ? (
          <Clear>No orders held for approval.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {orders.rows.map((o) => (
              <li key={o.id}>
                <Link href={`${PATH}/orders/${o.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Order {shortId(o.id)} · <span className="tabular-nums">{usd(o.totalCents)}</span>
                    </span>
                    <span className="block text-[11px] text-muted">
                      {o.lines.length} line{o.lines.length === 1 ? "" : "s"}
                      {o.lines[0] ? ` · ${o.lines[0].title}${o.lines.length > 1 ? " and more" : ""}` : ""}
                    </span>
                    {o.approvalReasons.length > 0 && <span className="mt-0.5 block text-[11px] text-warn">Held: {o.approvalReasons.join("; ")}</span>}
                  </span>
                  <span className={`text-[11px] tabular-nums ${isOverdue(o.createdAt, now) ? "text-warn" : "text-faint"}`}>
                    waiting {waitLabel(o.createdAt, now) ?? "—"} · Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title="Disputes, failed payments and payout exceptions" />
        <p className="text-xs text-muted">Not tracked yet — arrives with the payment provider.</p>
      </Card>
    </div>
  );
}
