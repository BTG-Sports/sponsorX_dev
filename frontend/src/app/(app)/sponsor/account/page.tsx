import { currentUser } from "@clerk/nextjs/server";

import { SponsorAccount } from "@/components/sponsor-account";
import { EmptyState } from "@/components/states";
import { StadiumHead, StadiumUpdated } from "@/components/stadium-stage";
import { signInLine } from "@/lib/account-live";
import type { ApiSponsorAccount } from "@/lib/sponsor-account-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Sponsor Account — POL-FE-102 (polish.md §102), on the Stadium Board.
   "Account details" under Account lands here: the company's details and the
   signed-in person's own, on one page.

   Reads  GET /sponsor/account   the company (name, categories, logo, website,
                                 address, billing contact), the person (name,
                                 job title, email), canEdit, a change waiting
                                 for BTG, BTG's last answer, and the email
                                 notification settings — one read.
          Clerk currentUser()    whether the sign-in email is confirmed
                                 (identity is Clerk's; nothing of it is stored).

   Who: a Sponsor Admin edits; a Sponsor Viewer reads the same page with no
   buttons (the API answers `canEdit: false` and refuses a viewer's write).
   Anyone else — a BTG preview has no sponsor behind it — gets the API's 403
   as "not in your role". The writes are ./actions.ts.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

type Live = { status: "ok"; account: ApiSponsorAccount } | { status: "forbidden" } | { status: "unavailable" };

function isAccount(a: unknown): a is ApiSponsorAccount {
  const x = a as Partial<ApiSponsorAccount> | null;
  return !!x && typeof x.company?.name === "string" && Array.isArray(x.company.categories) && !!x.company.billingContact
    && typeof x.me?.email === "string" && typeof x.canEdit === "boolean" && Array.isArray(x.notificationPreferences);
}

async function liveAccount(): Promise<Live> {
  try {
    const res = await apiFetch("/sponsor/account");
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) return { status: "unavailable" };
    const body = (await res.json()) as unknown;
    return isAccount(body) ? { status: "ok", account: body } : { status: "unavailable" };
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return { status: "unavailable" };
  }
}

export default async function SponsorAccountPage() {
  const actor = await requirePortalAccess("sponsor");
  const now = new Date();
  const head = (
    <StadiumHead title="Account" pill={<StadiumUpdated iso={now.toISOString()} />}>
      <p className="text-xs text-muted">Your company&rsquo;s details and your own, as BTG and the people you work with see them.</p>
    </StadiumHead>
  );

  const [live, user] = await Promise.all([liveAccount(), currentUser()]);

  if (live.status === "forbidden") {
    const sponsor = actor.roles.includes("SPONSOR_ADMIN") || actor.roles.includes("SPONSOR_ANALYST");
    return (
      <div className="space-y-6">
        {head}
        <EmptyState
          mark="users"
          title={sponsor ? "This login isn't linked to a sponsor account" : "Not in your role"}
          hint={sponsor
            ? "SponsorX can't find the sponsor account this login belongs to, so there are no details to show. Ask BTG to link it."
            : "The Account page is for a sponsor's own people. You're signed in as a BTG preview, with no sponsor account behind this login."}
          action={{ label: "Back to the Stadium Board", href: "/sponsor" }}
        />
      </div>
    );
  }
  if (live.status === "unavailable") {
    return (
      <div className="space-y-6">
        {head}
        <EmptyState mark="users" title="Your account couldn't be read just now" hint="Nothing here has changed. Refresh in a minute." />
      </div>
    );
  }

  const email = user?.primaryEmailAddress;
  /* Clerk's own address and whether it is confirmed; the API's copy when Clerk gave none. */
  const signIn = email ? signInLine(email.emailAddress, email.verification?.status === "verified") : live.account.me.email;

  return (
    <div className="space-y-6">
      {head}
      <SponsorAccount initial={live.account} signIn={signIn} now={now.toISOString()} />
    </div>
  );
}
