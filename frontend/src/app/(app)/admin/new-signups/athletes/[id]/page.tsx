import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { LiveSignupProfile } from "@/components/live-signup-profile";

/* --------------------------------------------------------------------------
   One athlete's sign-up — 2S1-FE-07 (Claude Design NewSignups.dc.html, view
   athlete), live since 2S1-BE-09 / -10: the page "New athlete …" emails
   link to. Approve (a held one), Reject (required reason, emailed) and
   Reinstate; documents through the 5-minute audited viewer.

   Reads  GET  /signups/athletes/:id
          GET  /signups/athletes/:id/documents/:documentId   (on View)
   Writes POST /signups/athletes/:id/{approve|reject|reinstate}  (../../actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";

export default async function AthleteSignupPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="New sign-ups" roles={lacking} />;
  return <LiveSignupProfile owner="athletes" id={(await params).id} />;
}
