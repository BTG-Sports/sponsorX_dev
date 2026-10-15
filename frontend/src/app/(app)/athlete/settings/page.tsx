import { AccountSettings } from "@/components/account-settings";
import { SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { requirePortalAccess } from "@/server/portal";
import { athleteCloseAccountAction, athleteSettingsLinkAction } from "./actions";

/* --------------------------------------------------------------------------
   Settings — 2S1-FE-08, the athlete portal (Claude Design Account.dc.html,
   views settings + close). The athlete's or guardian's own account: the
   sign-in email, the payout account on Stripe, and Close account.

   Reads  Clerk currentUser()                the sign-in email (live)
          GET /payouts/account               the payout account (live)
   Writes POST /payouts/account/link         Stripe ↗ (live, athleteSettingsLinkAction)
          POST /me/close                     close the account (live, athleteCloseAccountAction, 2S1-BE-13)

   A guardian opens this portal too: they have no payee (GET /payouts/account
   403s), so the payout row says the money is the athlete's. Closing ends at
   the public /reactivate page (2S1-BE-13); its two cases and the
   coming-of-age reminder (2S1-BE-12) are previews reached from the notice.
   ?demo=loading|error renders the branded states.

   P1-ART-22 (2026-10-11): rendered on the Arena through AccountSettings'
   `stage="arena"` — the title row with the provenance pill and the rows as
   plates; the property portal's copy keeps its look.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("athlete");
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const guardian = actor.roles.includes("GUARDIAN") && !actor.roles.includes("ATHLETE");

  return (
    <AccountSettings
      stage="arena"
      seat={guardian ? "guardian" : "athlete"}
      accountWords={guardian ? "guardian account" : "athlete account"}
      linkAction={athleteSettingsLinkAction}
      closeAction={athleteCloseAccountAction}
      noPayeeLine={guardian
        ? "Payouts go to the athlete’s own payout account on Stripe. There’s nothing to set up from this login."
        : "There’s no payout account on this login yet."}
      previews={[
        /* In-portal previews (portal views stay in the portal), not the public /reactivate. */
        { href: "/athlete/settings/reactivate?case=self", label: "reactivate within 30 days" },
        { href: "/athlete/settings/reactivate?case=btg", label: "closed by BTG" },
        { href: `/athlete/settings/coming-of-age?as=${guardian ? "guardian" : "athlete"}`, label: "coming-of-age reminder" },
      ]}
    />
  );
}
