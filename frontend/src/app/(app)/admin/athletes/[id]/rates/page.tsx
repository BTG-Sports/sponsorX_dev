import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/states";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { RateCardEditor } from "@/components/rate-card-editor";
import { textParam, type SearchParams } from "@/lib/list-query";
import { rateBackLink, validId, type ApiRateEditor } from "@/lib/athlete-rates-live";
import { apiFetch, fetchActor } from "@/server/api";
import { saveAthleteRate, saveAthleteTier } from "./actions";

/* --------------------------------------------------------------------------
   /admin/athletes/{id}/rates — BTG's rate card editor (POL-FE-51).

   Walkthrough practice (2026-11-15): the Matching Studio holds back any
   athlete with no rate for a package job, and nothing on screen wrote one.
   This is that screen. Every NIL job in the catalogue, the athlete's current
   rate on each, and a way to set or change one — and, first, the tier a rate
   needs (the API refuses a rate for an untiered athlete).

   Reads  GET  /athletes/{id}/rate-editor   (POL-BE-51)
   Writes POST /athletes/{id}/rates, PUT /athletes/{id}/tier   (./actions.ts)

   ?job=SX-01 opens that job's editor (the Studio's "Set a rate" link);
   ?brief=… adds the way back to the Studio on that brief; ?from=profile
   (the athlete profile's "Rate card" section) leads back there. Only BTG admins
   and network managers — the API's athleteRate write — reach it.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/athletes";

type Load = { kind: "ok"; editor: ApiRateEditor } | { kind: "denied" } | { kind: "anon" };

async function load(id: string): Promise<Load> {
  const who = await fetchActor();
  if (who.status !== "linked") return { kind: "anon" };
  /* No catch — an outage is an error page, never an empty card. */
  const res = await apiFetch(`/athletes/${encodeURIComponent(id)}/rate-editor`);
  if (res.status === 403 || res.status === 404) return { kind: "denied" };
  if (!res.ok) throw new Error(`Rate card unavailable (${res.status}).`);
  return { kind: "ok", editor: (await res.json()) as ApiRateEditor };
}

export default async function AthleteRatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Rate card" roles={lacking} />;

  const { id } = await params;
  const sp = await searchParams;
  const brief = textParam(sp, "brief");
  const job = textParam(sp, "job");
  const back = rateBackLink(id, { brief, from: textParam(sp, "from") });

  const data = validId(id) ? await load(id) : ({ kind: "denied" } as const);

  if (data.kind !== "ok") {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <h1 className="sx-page-title">Rate card</h1>
        <EmptyState
          mark="users"
          title={data.kind === "anon" ? "Sign in to set rates" : "This athlete's rate card isn't open to you"}
          hint={
            data.kind === "anon"
              ? "Rates are set by BTG admins and athlete network managers."
              : "Either the athlete isn't in your organisation, or your role can't set rates. BTG admins and athlete network managers set them."
          }
          action={{ label: back.label, href: back.href }}
        />
      </div>
    );
  }

  const a = data.editor.athlete;
  return (
    <div className="space-y-5">
      <BackLink target={back} />
      <div className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">Athlete Network · rate card</p>
        <h1 className="sx-page-title mt-1 [overflow-wrap:anywhere]">{a.displayName}</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
          {[a.sport, a.stateCode].filter(Boolean).join(" · ")} — what {a.displayName} is paid for each NIL job. Rates are
          BTG-internal: the athlete sees their own card, sponsors never see these. Every change is a new version, so
          offers already made keep the rate they quoted.
        </p>
      </div>
      <RateCardEditor
        editor={data.editor}
        openJob={validId(job) ? job : null}
        studio={validId(brief) ? back.href : null}
        actions={{ saveRate: saveAthleteRate, saveTier: saveAthleteTier }}
      />
    </div>
  );
}
