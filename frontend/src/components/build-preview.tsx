import Link from "next/link";

/* --------------------------------------------------------------------------
   Pre-launch navigation aid — NOT part of the product.

   The mockup's 12 screens live at 12 different routes, and until sign-in
   works there is no way to reach the portals from the marketing site. This
   band lists every screen with its build status.

   Delete this component and its usage in (public)/page.tsx before launch.
   -------------------------------------------------------------------------- */

type Screen = {
  n: string;
  label: string;
  href: string;
  status: "built" | "stub";
  surface: string;
};

const SCREENS: Screen[] = [
  { n: "1", label: "Homepage", href: "/", status: "built", surface: "public" },
  { n: "2", label: "Sponsor Login", href: "/login", status: "built", surface: "public" },
  { n: "3", label: "Sponsor Dashboard", href: "/sponsor", status: "built", surface: "sponsor" },
  { n: "4", label: "Marketplace", href: "/sponsor/marketplace", status: "built", surface: "sponsor" },
  { n: "5", label: "Property Profile", href: "/properties/demo-property", status: "built", surface: "public" },
  { n: "6", label: "Athlete Profile", href: "/athletes/shammah-kwizera", status: "built", surface: "public" },
  { n: "7", label: "Inventory Listing", href: "/sponsor/marketplace/SX-03", status: "built", surface: "sponsor" },
  { n: "8", label: "Campaign Builder", href: "/admin/campaigns", status: "built", surface: "admin" },
  { n: "9", label: "Campaign Dashboard", href: "/admin/campaigns/c1", status: "built", surface: "admin" },
  { n: "10", label: "QR / Reward Creator", href: "/admin/rewards/new", status: "built", surface: "admin" },
  { n: "11", label: "Fan / Reward Analytics", href: "/admin/analytics", status: "built", surface: "admin" },
  { n: "12", label: "Sponsor ROI Report", href: "/sponsor/campaigns/c1/report", status: "built", surface: "sponsor" },
];

/** Surfaces the mockup labels but does not draw as one of the twelve. */
const EXTRA: Screen[] = [
  { n: "—", label: "Athlete Portal", href: "/athlete", status: "built", surface: "athlete" },
  { n: "—", label: "Athlete Application", href: "/join", status: "stub", surface: "public" },
  { n: "—", label: "Package Catalog", href: "/packages", status: "stub", surface: "public" },
  { n: "—", label: "Admin Command Center", href: "/admin", status: "stub", surface: "admin" },
  { n: "—", label: "Fan Redeem (no login)", href: "/r/tok123", status: "built", surface: "fan" },
];

function Row({ s }: { s: Screen }) {
  // Tell the destination where it was entered from, so its back link returns
  // here rather than to a guessed parent. See src/lib/back.ts.
  const href =
    s.href === "/" || s.href.includes("?") ? s.href : `${s.href}?from=home`;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
    >
      <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-faint">
        {s.n}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted group-hover:text-text">
        {s.label}
      </span>
      <span className="shrink-0 text-[10px] text-faint">{s.surface}</span>
      <span
        className={[
          "w-9 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-medium",
          s.status === "built"
            ? "bg-accent/12 text-accent"
            : "bg-surface-2 text-faint",
        ].join(" ")}
      >
        {s.status}
      </span>
    </Link>
  );
}

export function BuildPreview() {
  const builtCount = [...SCREENS, ...EXTRA].filter(
    (s) => s.status === "built",
  ).length;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-12">
      <div className="rounded-xl border border-dashed border-line bg-surface/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-warn">
              Pre-launch build preview
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Sign-in is not wired yet, so every screen is reachable directly.
              {" "}
              {builtCount} built, the rest are labelled skeletons. This band is
              not part of the product.
            </p>
          </div>
          <Link
            href="/map"
            className="text-[11px] font-medium text-accent hover:underline"
          >
            Full route map →
          </Link>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          <div>
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              The 12 screens
            </p>
            {SCREENS.map((s) => (
              <Row key={s.href} s={s} />
            ))}
          </div>
          <div>
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Other surfaces
            </p>
            {EXTRA.map((s) => (
              <Row key={s.href} s={s} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
