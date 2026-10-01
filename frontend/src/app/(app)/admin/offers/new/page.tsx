import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OfferForm, type CampaignOption, type JobOption } from "@/components/offer-form";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { READ_ONLY_TIP, blankFields, mayWriteOffers } from "@/lib/admin-offers-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   New offer — 2S2-FE-03, BTG half (Claude Design Offers.dc.html, views form,
   formLow and send). The form (OfferForm) checks the draft live as it is
   filled in; "Save draft" and "Save and send" go through ../actions.ts.

   Reads  GET /campaigns?page=1&size=100&sort=name&state=…   the campaigns an offer can go on
          GET /catalogue/jobs                                 the NIL jobs
          GET /offers/athletes · GET /inventory · GET /campaigns/:id/offer-checks (from the form)
   Writes POST /offers, POST /offers/:id/send
   BTG admins and campaign managers (offer write); ?campaign= picks one;
   ?demo=loading|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/offers";
const TITLE = "New offer";
/** A campaign still being staffed or running can take an offer. */
const OFFERABLE = "DRAFT,STAFFING,APPROVAL,ACTIVE";

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Offers" roles={lacking} />;
  const who = await fetchActor();
  if (who.status === "linked" && !mayWriteOffers(who.actor.roles)) {
    return (
      <div className="space-y-5">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Offers</Link>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <EmptyState mark="users" title="Making offers isn't in your role" hint={READ_ONLY_TIP} action={{ label: "Back to Offers", href: PATH }} />
      </div>
    );
  }

  const [cRes, jRes] = await Promise.all([
    apiFetch(`/campaigns?${new URLSearchParams({ page: "1", size: "100", sort: "name", state: OFFERABLE })}`),
    apiFetch("/catalogue/jobs"),
  ]);
  if (!cRes.ok) throw new Error(`Campaigns unavailable (${cRes.status}).`);
  if (!jRes.ok) throw new Error(`NIL jobs unavailable (${jRes.status}).`);
  const campaigns = ((await cRes.json()) as { campaigns: CampaignOption[] }).campaigns.map((c) => ({ id: c.id, name: c.name, sponsorName: c.sponsorName }));
  const jobs = ((await jRes.json()) as { jobs: JobOption[] }).jobs.map((j) => ({ id: j.id, name: j.name }));
  const raw = (await searchParams).campaign;
  const pre = typeof raw === "string" && campaigns.some((c) => c.id === raw) ? raw : "";

  return (
    <div className="space-y-5">
      <Link href={PATH} className="text-xs text-muted hover:text-text">← Offers</Link>
      <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
      {campaigns.length === 0 ? (
        <EmptyState mark="inbox" title="No campaign to put an offer on" hint="An offer goes on a campaign that is being staffed or running. Create one from an approved brief first."
          action={{ label: "Open campaigns", href: "/admin/campaigns" }} />
      ) : (
        <OfferForm initial={blankFields(pre)} campaigns={campaigns} jobs={jobs} athlete={null} />
      )}
    </div>
  );
}
