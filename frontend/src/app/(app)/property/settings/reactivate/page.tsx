import { AccountReactivate } from "@/components/account-reactivate";
import { sampleClosedAccount } from "@/lib/account-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Reactivate your account — 2S1-FE-08, the property side (Claude Design
   Account.dc.html, views reactivate + rejected). An organization can close
   its account too (2S1-BE-13).

   SCAFFOLD on a sample account. 2S1-BE-13 is not built:
     Reads  the closed account's state and closing date   (2S1-BE-13)
     Writes reactivate a self-closed account               (2S1-BE-13)

   ?case=btg shows the account closed by BTG; anything else, the
   self-closed account with its 30 days. Like the athlete side, the real
   page belongs on a public route — see athlete/settings/reactivate.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/property/settings/reactivate";

export default async function PropertyReactivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  const raw = (await searchParams).case;
  const btg = (Array.isArray(raw) ? raw[0] : raw) === "btg";
  return (
    <AccountReactivate
      account={sampleClosedAccount(btg ? "CLOSED_BY_BTG" : "CLOSED_SELF", "Westfield Hawks")}
      switchHref={btg ? PATH : `${PATH}?case=btg`}
    />
  );
}
