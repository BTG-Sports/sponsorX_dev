import Link from "next/link";

// Development route map. Not a product screen - delete before launch.
const ROUTES = [
  { href: "/", title: 'SponsorX Network Landing', ref: '§9 screen 1', surface: 'public' },
  { href: "/packages", title: 'Sponsor Package Catalog', ref: '§9 screen 4 · §7', surface: 'public' },
  { href: "/join", title: 'Athlete Application', ref: '§11', surface: 'public' },
  { href: "/athletes/demo-athlete", title: 'Athlete Profile', ref: '§9 screen 5', surface: 'public' },
  { href: "/properties/demo-property", title: 'Property Profile', ref: '§9 screen 5', surface: 'public' },
  { href: "/sponsor", title: 'Sponsor Dashboard', ref: '§9 screen 3', surface: 'sponsor portal' },
  { href: "/sponsor/marketplace", title: 'Sponsor Marketplace', ref: '§9 screen 4', surface: 'sponsor portal' },
  { href: "/sponsor/marketplace/SX-03", title: 'NIL Job / Inventory Detail', ref: '§9 screen 7', surface: 'sponsor portal' },
  { href: "/sponsor/campaigns/demo-campaign/report", title: 'Sponsor ROI / Campaign Report', ref: '§9 screen 12', surface: 'sponsor portal' },
  { href: "/athlete", title: 'Athlete Portal', ref: '§9 screen 6 · §24', surface: 'athlete portal' },
  { href: "/athlete/invitations", title: 'Campaign Invitations', ref: '§21 · §13 step 5', surface: 'athlete portal' },
  { href: "/athlete/orders/demo-order", title: 'Campaign Order Acceptance', ref: '§12 · guide §08', surface: 'athlete portal' },
  { href: "/athlete/earnings", title: 'Athlete Earnings', ref: '§24 · §21', surface: 'athlete portal' },
  { href: "/property", title: 'Property Portal', ref: '§8 PROPERTY_MGR', surface: 'property portal' },
  { href: "/admin", title: 'BTG Admin Command Center', ref: '§10 · §23', surface: 'admin' },
  { href: "/admin/applications", title: 'Athlete Network Manager Workspace', ref: '§10 · §23', surface: 'admin' },
  { href: "/admin/campaigns/new", title: 'Campaign Builder + Athlete Matching', ref: '§9 screen 8', surface: 'admin' },
  { href: "/admin/campaigns/demo-campaign", title: 'Campaign Operations Dashboard', ref: '§9 screen 9', surface: 'admin' },
  { href: "/admin/approvals", title: 'Content Approval Workspace', ref: '§10', surface: 'admin' },
  { href: "/admin/rewards/new", title: 'QR / Reward Creator', ref: '§9 screen 10 · §16', surface: 'admin' },
  { href: "/admin/analytics", title: 'Analytics / Athlete Performance', ref: '§9 screen 11 · §22', surface: 'admin' },
  { href: "/admin/finance", title: 'Finance Workspace', ref: '§10', surface: 'admin' },
  { href: "/r/DEMO_TOKEN", title: "Fan Redeem", ref: "§16", surface: "fan (no login)" },
];

export default function RouteMap() {
  const groups = Array.from(new Set(ROUTES.map((r) => r.surface)));
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">SponsorX route map</h1>
      <p className="mt-2 text-sm text-muted">
        Skeleton routes for Phase 1. Structure follows §02 of the
        implementation guide; screen references point into Master
        Development Blueprint v2.0.
      </p>
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {g}
          </h2>
          <ul className="mt-2 divide-y divide-line-soft border-y border-line">
            {ROUTES.filter((r) => r.surface === g).map((r) => (
              <li key={r.href}>
                <Link
                  href={
                    r.href === "/" || r.href.includes("?")
                      ? r.href
                      : `${r.href}?from=map`
                  }
                  className="flex items-baseline justify-between gap-4 py-2 hover:bg-surface-2"
                >
                  <span className="text-sm font-medium">{r.title}</span>
                  <span className="shrink-0 text-xs text-muted">{r.ref}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
