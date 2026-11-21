import Link from "next/link";

/* --------------------------------------------------------------------------
   "+ Create a campaign" — POL-FE-107 (polish.md §107).

   The sponsor portal's three "+ New request" buttons (Dashboard, Campaigns,
   Requests) and its empty states used to open Packages, so "create" only ever
   led to a ready-made bundle. They all open the campaign builder now. One
   place for the words and the address, so no page drifts back to Packages.

   Packages is still in the Marketplace menu, and an empty page offers it as
   the second choice ("or start from a ready-made package").

   No hooks: a server page renders these as they are.
   -------------------------------------------------------------------------- */

export const CREATE_CAMPAIGN_HREF = "/sponsor/campaigns/new";
export const PACKAGES_HREF = "/sponsor/marketplace";

/** The button in a page's header. */
export function CreateCampaignButton() {
  return (
    <Link href={CREATE_CAMPAIGN_HREF} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
      + Create a campaign
    </Link>
  );
}

/** An empty page's two ways to start: the builder first, a ready-made package second. */
export function CreateCampaignStart({ className = "mt-4" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 ${className}`}>
      <Link href={CREATE_CAMPAIGN_HREF} className="inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
        + Create a campaign
      </Link>
      <Link href={PACKAGES_HREF} className="text-xs font-medium text-sponsor hover:underline">
        or start from a ready-made package
      </Link>
    </div>
  );
}

/** Inside a sentence in an empty table: "No campaigns yet. Create a campaign →". */
export function CreateCampaignInline() {
  return (
    <Link href={CREATE_CAMPAIGN_HREF} className="font-medium text-sponsor hover:underline">
      Create a campaign →
    </Link>
  );
}
