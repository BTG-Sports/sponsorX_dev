/* --------------------------------------------------------------------------
   Back-link resolution.

   Detail screens are reachable from several places — the marketplace, a
   property roster, the campaign builder, a campaign roster, the athlete's own
   portal — and a hardcoded "Back to Marketplace" is wrong in four of those
   five cases.

   Every inbound link passes `?from=<key>`; the detail page resolves it here
   and renders the matching label and target. Unknown or missing keys fall
   back to the screen's natural parent, so a pasted URL still behaves.

   No client JS and no history sniffing: the referrer is in the URL, which
   also means the back link survives a refresh and a shared link.
   -------------------------------------------------------------------------- */

export type BackTarget = { href: string; label: string };

const TARGETS: Record<string, BackTarget> = {
  home: { href: "/", label: "Back to home" },
  map: { href: "/map", label: "Back to route map" },

  // marketplace, per tab
  "mk-packages": { href: "/sponsor/marketplace", label: "Back to Marketplace" },
  "mk-athletes": {
    href: "/sponsor/marketplace?tab=athletes",
    label: "Back to Athletes",
  },
  "mk-media": {
    href: "/sponsor/marketplace?tab=media",
    label: "Back to Marketplace",
  },

  // portals
  sponsor: { href: "/sponsor", label: "Back to Dashboard" },
  admin: { href: "/admin", label: "Back to Admin" },
  "athlete-portal": { href: "/athlete", label: "Back to your dashboard" },

  // records
  property: {
    href: "/properties/btg-sports-talk",
    label: "Back to BTG Sports Talk",
  },
  builder: {
    href: "/admin/campaigns/new",
    label: "Back to Campaign Builder",
  },
  campaign: {
    href: "/admin/campaigns/c1",
    label: "Back to Campaign",
  },
  report: {
    href: "/sponsor/campaigns/c1/report",
    label: "Back to ROI Report",
  },
  inventory: {
    href: "/sponsor/marketplace/SX-03",
    label: "Back to Player of the Week",
  },
};

/**
 * @param from     the `from` search param, if any
 * @param fallback key used when `from` is missing or unrecognised
 */
export function resolveBack(
  from: string | undefined,
  fallback: keyof typeof TARGETS,
): BackTarget {
  if (from && TARGETS[from]) return TARGETS[from];
  return TARGETS[fallback];
}
