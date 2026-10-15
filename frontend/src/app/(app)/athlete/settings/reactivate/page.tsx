import Link from "next/link";

import { AccountReactivate } from "@/components/account-reactivate";
import { ArenaHead } from "@/components/arena-stage";
import { BlockedNotice } from "@/components/ui";
import { reactivateView, sampleReactivation } from "@/lib/account-closure-live";
import { requirePortalAccess } from "@/server/portal";
import { supportContact } from "@/server/support";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the reactivation screen, previewed inside the athlete portal.

   The real page is public, /reactivate (2S1-BE-13): the person coming back
   has a closed login and can't sign in, so it is reached by the signed link
   in their email. A signed-in athlete looking at what that screen says
   stays here instead (memory portal-views-stay-in-portal; P1-ART-22 QA,
   2026-10-11 — this path used to redirect to the public /reactivate?demo=).
   ?case=self|btg picks the sample: closed by the athlete, or by BTG. The
   sample never reaches the API and its buttons stay off.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/settings/reactivate";

function BackPill() {
  return (
    <Link
      href="/athlete/settings"
      className="sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span aria-hidden="true">←</span>
      Settings
    </Link>
  );
}

export default async function AthleteReactivatePreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  /* ?demo= was the public page's switch; old links carry either. */
  const raw = sp.case ?? sp.demo;
  const btg = (Array.isArray(raw) ? raw[0] : raw) === "btg";
  const sample = sampleReactivation(btg ? "CLOSED_BY_BTG" : "CLOSED_SELF", "Riley");
  const support = await supportContact();

  return (
    <div className="space-y-5">
      <ArenaHead title="Reactivate your account" lede="What a closed account sees when it comes back." actions={<BackPill />} />
      <BlockedNotice>
        Preview with a sample account, {btg ? "closed by BTG" : "closed by its owner"}.{" "}
        <Link href={`${PATH}?case=${btg ? "self" : "btg"}`} className="underline underline-offset-2 hover:text-text">
          {btg ? "See a self-closed account" : "See an account closed by BTG"}
        </Link>
        . The real page opens from the link in the closing email; nothing here is sent.
      </BlockedNotice>
      <AccountReactivate view={reactivateView(sample)} supportEmail={support.email} portalPath={sample.portalPath} titled={false} />
    </div>
  );
}
