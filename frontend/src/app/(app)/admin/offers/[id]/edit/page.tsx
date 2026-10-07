import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OfferForm, type JobOption } from "@/components/offer-form";
import { EmptyState } from "@/components/states";
import { READ_ONLY_TIP, fieldsOf, mayWriteOffers, type ApiStaffOffer } from "@/lib/admin-offers-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Edit a draft — 2S2-FE-03, BTG half (Claude Design Offers.dc.html, view
   form, reached from a draft's Edit — a fresh draft, or the copy a revise
   opened). Every term but the campaign and the athlete; the API asks the
   whole draft again on each save.

   Reads  GET  /offers/:id · GET /catalogue/jobs
          GET  /inventory · GET /campaigns/:id/offer-checks (from the form)
   Writes PATCH /offers/:id, POST /offers/:id/send (OfferForm → ../../actions.ts)
   BTG admins and campaign managers (offer write).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/offers";
const TITLE = "Edit the draft";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Offers" roles={lacking} />;
  const { id } = await params;
  const back = `${PATH}/${encodeURIComponent(id)}`;
  const who = await fetchActor();
  if (who.status === "linked" && !mayWriteOffers(who.actor.roles)) {
    return (
      <div className="space-y-5">
        <Link href={back} className="text-xs text-muted hover:text-text">← The offer</Link>
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="users" title="Changing offers isn't in your role" hint={READ_ONLY_TIP} action={{ label: "Back to the offer", href: back }} />
      </div>
    );
  }
  const [res, jRes] = await Promise.all([apiFetch(`/offers/${encodeURIComponent(id)}`), apiFetch("/catalogue/jobs")]);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Offer unavailable (${res.status}).`);
  if (!jRes.ok) throw new Error(`NIL jobs unavailable (${jRes.status}).`);
  const o = res.ok ? ((await res.json()) as ApiStaffOffer) : null;
  if (!o) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Offers</Link>
        <p className="text-sm">No offer matches this link.</p>
      </div>
    );
  }
  if (o.state !== "DRAFT") {
    return (
      <div className="space-y-5">
        <Link href={back} className="text-xs text-muted hover:text-text">← The offer</Link>
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="This offer is no longer a draft"
          hint="Terms are fixed once sent. To change them, open the offer and send a revised offer." action={{ label: "Open the offer", href: back }} />
      </div>
    );
  }
  const jobs = ((await jRes.json()) as { jobs: JobOption[] }).jobs.map((j) => ({ id: j.id, name: j.name }));

  return (
    <div className="space-y-5">
      <Link href={back} className="text-xs text-muted hover:text-text">← The offer</Link>
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">{o.athlete.name} · {o.sponsorName} · {o.campaignName}</p>
      </div>
      <OfferForm offerId={o.id} initial={fieldsOf(o)}
        campaigns={[{ id: o.campaignId, name: o.campaignName, sponsorName: o.sponsorName }]} jobs={jobs}
        athlete={{ id: o.athleteId, ...o.athlete }} />
    </div>
  );
}
