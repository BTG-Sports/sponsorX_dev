import { AccountSettings } from "@/components/account-settings";
import { SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { requirePortalAccess } from "@/server/portal";
import { athleteSettingsLinkAction } from "./actions";

/* --------------------------------------------------------------------------
   Settings — 2S1-FE-08, the athlete portal (Claude Design Account.dc.html,
   views settings + close). The athlete's or guardian's own account: the
   sign-in email, the payout account on Stripe, and Close account.

   Reads  Clerk currentUser()                the sign-in email (live)
          GET /payouts/account               the payout account (live)
   Writes POST /payouts/account/link         Stripe ↗ (live, athleteSettingsLinkAction)
          close the account                  2S1-BE-13 — not built; disabled

   A guardian opens this portal too: they have no payee (GET /payouts/account
   403s), so the payout row says the money is the athlete's. The
   reactivation page and the coming-of-age reminder are scaffolds reached
   from the notice at the top (2S1-BE-13, 2S1-BE-12).
   ?demo=loading|error renders the branded states.
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
      seat={guardian ? "guardian" : "athlete"}
      accountWords={guardian ? "guardian account" : "athlete account"}
      linkAction={athleteSettingsLinkAction}
      noPayeeLine={guardian
        ? "Payouts go to the athlete’s own payout account on Stripe. There’s nothing to set up from this login."
        : "There’s no payout account on this login yet."}
      previews={[
        { href: "/athlete/settings/reactivate", label: "reactivate within 30 days" },
        { href: "/athlete/settings/reactivate?case=btg", label: "closed by BTG" },
        { href: `/athlete/settings/coming-of-age?as=${guardian ? "guardian" : "athlete"}`, label: "coming-of-age reminder" },
      ]}
    />
  );
}
