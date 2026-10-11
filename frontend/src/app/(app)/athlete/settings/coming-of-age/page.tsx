import Link from "next/link";

import { ArenaHead } from "@/components/arena-stage";
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

   P1-ART-22 (2026-10-11): the Arena's title row (ArenaHead with the
   provenance pill and the view's greeting as the lede, a back pill to
   Settings) and the two paused-action cards as plates. The reminder, its
   send-link island and every line are unchanged.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/settings/coming-of-age";

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

export default async function ComingOfAgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  /* ?as= was the scaffold's switch; it previews the same way. */
  const raw = sp.demo ?? sp.as;
  const demo = Array.isArray(raw) ? raw[0] : raw;

  if (demo === "athlete" || demo === "guardian") {
    const view = comingOfAgeView(sampleComingOfAge(), demo)!;
    return (
      <div className="space-y-5">
        <ArenaHead title="Coming of age" lede={view.heading} actions={<BackPill />} />
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
        <PausedActions view={view} plate />
      </div>
    );
  }

  const res = await apiFetch("/coming-of-age/mine");
  if (!res.ok) throw new Error(`The coming-of-age allowance couldn't be read (${res.status}).`);
  const { comingOfAge: c } = (await res.json()) as { comingOfAge: ApiComingOfAge | null };
  const view = c ? comingOfAgeView(c, c.seat ?? "athlete") : null;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (!c || !view) {
    return (
      <div className="space-y-5">
        <ArenaHead title="Coming of age" pill={`Postgres · read ${readAt}`} actions={<BackPill />} />
        <EmptyState
          mark="users"
          title="Nothing to do here"
          hint="When an athlete under their state's or country's age of majority reaches it, they have 90 days to upload a government ID and take over their account. This page shows that countdown while it runs."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ArenaHead title="Coming of age" pill={`Postgres · read ${readAt}`} lede={view.heading} actions={<BackPill />} />
      <ComingOfAgeReminder view={view} seat={c.seat ?? "athlete"} uploadPath={c.uploadPath ?? null} />
      <PausedActions view={view} plate />
    </div>
  );
}
