import { currentUser } from "@clerk/nextjs/server";

import { AdvisorProfile } from "@/components/advisor-profile";
import { EmptyState } from "@/components/states";
import { signInLine } from "@/lib/account-live";
import { isAdvisorProfile, type ApiAdvisorProfile } from "@/lib/advisor-profile-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Advisor Profile — POL-FE-103 (polish.md §103). "Profile" in the advisor's
   menu lands here: who the advisor is, and the one school they review for.

   Reads  GET /advisor/profile   the advisor (name, job title, phone, email),
                                 the school (name, kind — both BTG's — its
                                 email domain, the roster's size and last
                                 update) — one read.
          Clerk currentUser()    whether the sign-in email is confirmed
                                 (identity is Clerk's; nothing of it is stored).

   Who: an ADVISOR's own login, for the school it is linked to. The API
   refuses everyone else (403): BTG staff previewing this portal have no
   school behind their login, and are told so instead of shown a sample.
   The write is ./actions.ts; the email domain and the roster keep the
   advisor home's own actions (../actions.ts).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

type Live = { status: "ok"; profile: ApiAdvisorProfile } | { status: "forbidden" } | { status: "unavailable" };

async function liveProfile(): Promise<Live> {
  try {
    const res = await apiFetch("/advisor/profile");
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) return { status: "unavailable" };
    const body = (await res.json()) as unknown;
    return isAdvisorProfile(body) ? { status: "ok", profile: body } : { status: "unavailable" };
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return { status: "unavailable" };
  }
}

export default async function AdvisorProfilePage() {
  const actor = await requirePortalAccess("advisor");
  const [live, user] = await Promise.all([liveProfile(), currentUser()]);

  const head = (sub: string) => (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );

  if (live.status === "forbidden") {
    const advisor = actor.roles.includes("ADVISOR");
    return (
      <div className="space-y-6">
        {head("Your details and your school’s.")}
        <EmptyState
          mark="users"
          title={advisor ? "This login isn't linked to a school" : "Not in your role"}
          hint={advisor
            ? "SponsorX can't find the school this advisor login belongs to, so there is no profile to show. Ask BTG to link it."
            : "The Profile page is a school advisor's own. You're signed in as a BTG preview, with no school behind this login."}
          action={{ label: "Back to applications", href: "/advisor" }}
        />
      </div>
    );
  }
  if (live.status === "unavailable") {
    return (
      <div className="space-y-6">
        {head("Your details and your school’s.")}
        <EmptyState mark="users" title="Your profile couldn't be read just now" hint="Nothing here has changed. Refresh in a minute." />
      </div>
    );
  }

  const email = user?.primaryEmailAddress;
  /* Clerk's own address and whether it is confirmed; the API's copy when Clerk gave none. */
  const signIn = email ? signInLine(email.emailAddress, email.verification?.status === "verified") : live.profile.me.email;

  return (
    <div className="space-y-6">
      {head(`Your details and ${live.profile.school.name}’s, as your students and BTG see them.`)}
      <AdvisorProfile profile={live.profile} signIn={signIn} />
    </div>
  );
}
