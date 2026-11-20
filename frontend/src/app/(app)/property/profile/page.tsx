import { currentUser } from "@clerk/nextjs/server";

import { PropertyProfile } from "@/components/property-profile";
import { EmptyState } from "@/components/states";
import { signInLine } from "@/lib/account-live";
import { isPropertyProfile, kindNoun, type ApiPropertyProfile } from "@/lib/property-profile-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Property Profile — POL-FE-104 (polish.md §104). "Profile" in the property
   menu lands here: the organisation's own details and the manager's, on one
   page. Until now only BTG saw the whole record (/admin/onboarding/[id]).

   Reads  GET /property/profile   the organisation (name, type, city, state,
                                  the type's details, description, main
                                  contact), the manager (name, job title,
                                  phone, email), a change waiting for BTG and
                                  the last answer — one read.
          Clerk currentUser()     whether the sign-in email is confirmed
                                  (identity is Clerk's; nothing of it is stored).

   Who: the PROPERTY_MGR of that property. The API refuses everyone else
   (403): BTG staff previewing this portal have no property behind their
   login and are told so, never shown a sample. The writes are ./actions.ts.
   Settings (payouts, notifications, closing) and Branding stay where they are.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

type Live = { status: "ok"; profile: ApiPropertyProfile } | { status: "forbidden" } | { status: "unavailable" };

async function liveProfile(): Promise<Live> {
  try {
    const res = await apiFetch("/property/profile");
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) return { status: "unavailable" };
    const body = (await res.json()) as unknown;
    return isPropertyProfile(body) ? { status: "ok", profile: body } : { status: "unavailable" };
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return { status: "unavailable" };
  }
}

export default async function PropertyProfilePage() {
  const actor = await requirePortalAccess("property");
  const now = new Date();
  const [live, user] = await Promise.all([liveProfile(), currentUser()]);

  const head = (sub: string) => (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>
    </div>
  );

  if (live.status === "forbidden") {
    const manager = actor.roles.includes("PROPERTY_MGR");
    return (
      <div className="space-y-6">
        {head("Your organisation’s details and your own.")}
        <EmptyState
          mark="users"
          title={manager ? "This login isn't linked to an organisation" : "Not in your role"}
          hint={manager
            ? "SponsorX can't find the organisation this login manages, so there is no profile to show. Ask BTG to link it."
            : "The Profile page is a property manager's own. You're signed in as a BTG preview, with no organisation behind this login."}
          action={{ label: "Back to the dashboard", href: "/property" }}
        />
      </div>
    );
  }
  if (live.status === "unavailable") {
    return (
      <div className="space-y-6">
        {head("Your organisation’s details and your own.")}
        <EmptyState mark="users" title="Your profile couldn't be read just now" hint="Nothing here has changed. Refresh in a minute." />
      </div>
    );
  }

  const email = user?.primaryEmailAddress;
  /* Clerk's own address and whether it is confirmed; the API's copy when Clerk gave none. */
  const signIn = email ? signInLine(email.emailAddress, email.verification?.status === "verified") : live.profile.me.email;

  return (
    <div className="space-y-6">
      {head(`Your ${kindNoun(live.profile.property.kind)}’s details and your own, as BTG and sponsors see them.`)}
      <PropertyProfile initial={live.profile} signIn={signIn} now={now.toISOString()} />
    </div>
  );
}
