import { currentUser } from "@clerk/nextjs/server";

import { requirePortalAccess } from "@/server/portal";
import { PortalShell } from "@/components/portal-shell";
import { sponsorNavFor } from "@/lib/sponsor-nav";
import { withMessages } from "@/lib/deal-chat-nav";
import { unreadTotal } from "@/lib/deal-chat";
import { dealViewer, portalChats } from "@/server/deal-chat";
import { ChatDock } from "@/components/deal-chat/chat-dock";
import { welcomeWord } from "@/lib/sponsor-words";

import "./stadium.css";
import "../../mobile-nav.css";

/* The sidebar takes the admin/athlete structure (P1-ART-23, lib/sponsor-nav.ts):
   Dashboard alone on top, every other desk in a collapsible group. */

/* P1-ART-24 — the phone dock's four destinations (the rest are behind its Menu). */
const DOCK = ["/sponsor", "/sponsor/campaigns", "/sponsor/shop", "/sponsor/orders"];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function SponsorLayout({ children }: LayoutProps<"/sponsor">) {
  const actor = await requirePortalAccess("sponsor");

  /* P7-QA-02 — the athlete layout's rule (P3-FE-03): the chrome greets the
     person who signed in, from Clerk, never the fixture "Under Armour / John
     Smith". The org line is left to the shell (it falls back to the user's
     name) until the sponsor's own name is resolved here; with no Clerk
     name set it falls back to the email, never to a fixture. */
  const user = await currentUser();
  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const role = actor.roles.includes("SPONSOR_ADMIN")
    ? "Sponsor Admin"
    : actor.roles.includes("SPONSOR_ANALYST")
      ? "Sponsor Viewer"
      : "BTG preview";

  /* 2S4-FE-07 — Deal Chat: the Messages link is always in the sidebar (owner,
     2026-11-19), with the unread count; the round button only once the
     sponsor has a chat (none while the DEAL_CHAT switch is off). */
  const chats = await portalChats("sponsor", actor);
  const unread = unreadTotal(chats);

  return (
    <PortalShell
      portal="sponsor"
      /* POL-FE-19 — Team only for a Sponsor Admin; the array itself is unchanged. */
      nav={withMessages(sponsorNavFor(actor.roles), "sponsor")}
      counts={{ "/sponsor/messages": unread }}
      rootHref="/sponsor"
      dock={DOCK}
      userName={clerkName || user?.primaryEmailAddress?.emailAddress || "Sponsor"}
      userRole={role}
      /* POL-FE-32 — "Welcome", not "Welcome back", on a first sign-in: the
         sign-in that opened this session came within a day of the Clerk
         account being created (approved minutes ago, signing in now). */
      greeting={welcomeWord({ createdAt: user?.createdAt, lastSignInAt: user?.lastSignInAt })}
      /* P1-ART-23 — the whole sponsor portal on the Stadium Board. */
      stage="stadium"
    >
      {children}
      {chats.length > 0 && <ChatDock viewer={dealViewer("sponsor", actor)} unread={unread} />}
    </PortalShell>
  );
}
