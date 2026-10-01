import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { LiveSignupProfile } from "@/components/live-signup-profile";

/* --------------------------------------------------------------------------
   One guardian's sign-up — 2S1-FE-07 (Claude Design NewSignups.dc.html,
   views guardian and reject), live since 2S1-BE-10: their details, the
   athletes they look after, their ID and proof of guardianship through the
   5-minute audited viewer. Rejecting a guardian rejects every athlete they
   look after — the dialog names them.

   Reads  GET  /signups/guardians/:id
          GET  /signups/guardians/:id/documents/:documentId   (on View)
   Writes POST /signups/guardians/:id/{reject|reinstate}        (../../actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";

export default async function GuardianSignupPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="New sign-ups" roles={lacking} />;
  return <LiveSignupProfile owner="guardians" id={(await params).id} />;
}
