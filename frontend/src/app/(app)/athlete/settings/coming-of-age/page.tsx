import Link from "next/link";

import { BlockedNotice } from "@/components/ui";
import { ComingOfAgeReminder, PausedActions } from "@/components/coming-of-age-reminder";
import { EmptyState } from "@/components/states";
import { comingOfAgeView, sampleComingOfAge, type ApiComingOfAge } from "@/lib/account-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Coming of age — 2S1-FE-08 (Claude Design Account.dc.html, views
   ageAthlete + ageGuardian). What the athlete and the guardian see during
   the 90-day allowance after the athlete reaches their place's age of
   majority: the reminder with its countdown, and what is paused meanwhile
   (adding items, new deals) while agreed orders carry on.

   LIVE since 2S1-BE-12:
     Reads  GET  /coming-of-age/mine        the allowance — reached on, due, which seat
     Writes POST /coming-of-age/send-link   the guardian sends the athlete the link
            (the athlete's own upload is the public /coming-of-age/<token> page)
   The seat is the API's: the athlete's own login, or the guardian acting
   for them. With no allowance running there is nothing to show.

   ?demo=athlete|guardian (or the scaffold's ?as=) previews either side on
   the sample athlete, and never reaches the API.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/settings/coming-of-age";

export default async function ComingOfAgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  /* ?as= was the scaffold's switch; it previews the same way. */
  const raw = sp.demo ?? sp.as;
  const demo = Array.isArray(raw) ? raw[0] : raw;

  if (demo === "athlete" || demo === "guardian") {
    const view = comingOfAgeView(sampleComingOfAge(), demo)!;
    return (
      <div className="space-y-3.5">
        <BlockedNotice>
          Preview — the sample athlete, from the {demo}&rsquo;s side.{" "}
          <Link href={`${PATH}?demo=${demo === "guardian" ? "athlete" : "guardian"}`} className="underline underline-offset-2 hover:text-text">
            {demo === "guardian" ? "See the athlete’s side" : "See the guardian’s side"}
          </Link>
          . Nothing here is sent.
        </BlockedNotice>
        <section role="alert" aria-label="Coming of age" className="rounded-xl border border-warn/50 bg-warn/8 px-4.5 py-4">
          <strong className="block text-sm text-warn">{view.title}</strong>
          <span className="mt-1 block text-sm leading-relaxed">{view.line}</span>
        </section>
        <h1 className="text-xl font-semibold tracking-tight">{view.heading}</h1>
        <PausedActions view={view} />
      </div>
    );
  }

  const res = await apiFetch("/coming-of-age/mine");
  if (!res.ok) throw new Error(`The coming-of-age allowance couldn't be read (${res.status}).`);
  const { comingOfAge: c } = (await res.json()) as { comingOfAge: ApiComingOfAge | null };
  const view = c ? comingOfAgeView(c, c.seat ?? "athlete") : null;

  if (!c || !view) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Coming of age</h1>
        <EmptyState
          mark="users"
          title="Nothing to do here"
          hint="When an athlete under their state's or country's age of majority reaches it, they have 90 days to upload a government ID and take over their account. This page shows that countdown while it runs."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <ComingOfAgeReminder view={view} seat={c.seat ?? "athlete"} uploadPath={c.uploadPath ?? null} />
      <h1 className="text-xl font-semibold tracking-tight">{view.heading}</h1>
      <PausedActions view={view} />
    </div>
  );
}
