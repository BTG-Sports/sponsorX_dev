import { AccountSettings } from "@/components/account-settings";
import { SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { requirePortalAccess } from "@/server/portal";
import { propertyCloseAccountAction, propertySettingsLinkAction } from "./actions";

/* --------------------------------------------------------------------------
   Settings — 2S1-FE-08, the property portal (Claude Design Account.dc.html,
   views settings + close; the team nav's Settings opens the same screen).
   The property manager's sign-in, the organization's payout account on
   Stripe, and Close account.

   Reads  Clerk currentUser()                the sign-in email (live)
          GET /payouts/account               the payout account (live)
   Writes POST /payouts/account/link         Stripe ↗ (live, propertySettingsLinkAction)
          POST /me/close                     close the account (live, propertyCloseAccountAction, 2S1-BE-13)

   Closing ends at the public /reactivate page (2S1-BE-13); its two cases
   are previews reached from the notice at the top.
   ?demo=loading|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  return (
    <AccountSettings
      seat="property"
      accountWords="property manager account"
      linkAction={propertySettingsLinkAction}
      closeAction={propertyCloseAccountAction}
      noPayeeLine="There’s no payout account for this login. Ask BTG to link it to your property."
      previews={[
        { href: "/reactivate?demo=self", label: "reactivate within 30 days" },
        { href: "/reactivate?demo=btg", label: "closed by BTG" },
      ]}
    />
  );
}
