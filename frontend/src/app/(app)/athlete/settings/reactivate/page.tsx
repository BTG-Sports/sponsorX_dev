import { AccountReactivate } from "@/components/account-reactivate";
import { sampleClosedAccount } from "@/lib/account-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Reactivate your account — 2S1-FE-08, the athlete side (Claude Design
   Account.dc.html, views reactivate + rejected).

   SCAFFOLD on a sample account. 2S1-BE-13 is not built:
     Reads  the closed account's state and closing date   (2S1-BE-13)
     Writes reactivate a self-closed account               (2S1-BE-13)

   ?case=btg shows the account closed by BTG (it can't reactivate itself —
   Contact BTG); anything else, the self-closed account with its 30 days.

   It sits inside the portal for now so it can be seen. The real page is
   reached by someone whose account is closed and who can't sign in
   normally, so it belongs on a public route with its own proof of who is
   asking — that part is 2S1-BE-13's, and is not built here.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/settings/reactivate";

export default async function AthleteReactivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const raw = (await searchParams).case;
  const btg = (Array.isArray(raw) ? raw[0] : raw) === "btg";
  return (
    <AccountReactivate
      account={sampleClosedAccount(btg ? "CLOSED_BY_BTG" : "CLOSED_SELF", "Riley")}
      switchHref={btg ? PATH : `${PATH}?case=btg`}
    />
  );
}
