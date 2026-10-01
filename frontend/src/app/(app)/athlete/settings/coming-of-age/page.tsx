import Link from "next/link";

import { BlockedNotice } from "@/components/ui";
import { ComingOfAgeReminder, PausedActions } from "@/components/coming-of-age-reminder";
import { comingOfAgeView, sampleComingOfAge } from "@/lib/account-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Coming of age — 2S1-FE-08 (Claude Design Account.dc.html, views
   ageAthlete + ageGuardian). What the athlete and the guardian see during
   the 90-day allowance after the athlete reaches their place's age of
   majority: the reminder with its countdown, and what is paused meanwhile
   (adding items, new deals) while agreed orders carry on.

   SCAFFOLD on a sample athlete. 2S1-BE-12 is not built:
     Reads  the athlete's allowance (reached on, days left, ID uploaded)   (2S1-BE-12)
     Writes upload the government ID / send the athlete the link          (2S1-BE-12)

   ?as=guardian|athlete picks the side; with no ?as the viewer's own role
   decides (a GUARDIAN login sees the guardian's side). The reminder is a
   component, so it moves onto /athlete once the allowance is real.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/settings/coming-of-age";

export default async function ComingOfAgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("athlete");
  const raw = (await searchParams).as;
  const as = Array.isArray(raw) ? raw[0] : raw;
  const guardianLogin = actor.roles.includes("GUARDIAN") && !actor.roles.includes("ATHLETE");
  const seat = as === "guardian" || as === "athlete" ? as : guardianLogin ? "guardian" : "athlete";
  const view = comingOfAgeView(sampleComingOfAge(), seat)!;

  return (
    <div className="space-y-3.5">
      <BlockedNotice>
        Sample athlete — the coming-of-age reminder goes live with 2S1-BE-12 (age of majority by state and country, and
        coming of age).{" "}
        <Link href={`${PATH}?as=${seat === "guardian" ? "athlete" : "guardian"}`} className="underline underline-offset-2 hover:text-text">
          {seat === "guardian" ? "See the athlete’s side" : "See the guardian’s side"}
        </Link>
        .
      </BlockedNotice>
      <ComingOfAgeReminder view={view} />
      <h1 className="text-xl font-semibold tracking-tight">{view.heading}</h1>
      <PausedActions view={view} />
    </div>
  );
}
