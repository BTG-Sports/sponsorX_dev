import { JoinWizard } from "@/components/join-wizard";
import type { ApiRulesWording } from "@/lib/confirmations-live";
import type { CollabAgreement } from "@/lib/join-flow";

import { publicApi } from "@/app/(public)/onboarding/public-api";

/* --------------------------------------------------------------------------
   Athlete Application, the form — §11. The wizard moved here from the /join
   landing (POL-FE-115, 2026-11-19); the landing's "Start application" button
   leads to it. One section per screen, full screen (join-wizard.tsx).

   Wired (P3-FE-01): submit POSTs the real application through the server
   action in app/(public)/join/actions.ts. Demo modes stay simulation —
   ?demo=minor lands on step 1 with an under-18 date of birth, ?demo=submitted
   on the after-submit state with the guardian card, and neither ever
   reaches the API.

   P8-FE-07 — the click-wrap shows the Content Collaboration Agreement in
   force, read here from GET /public/agreements/collab (v2, approved
   2026-10-22). Unreachable, the step says so and the application waits.

   P8-FE-03 — the same step shows the rules wording from
   GET /public/rules-attestation as a second tick box for an adult; its
   version travels with the application. A minor is told their guardian
   confirms it instead. Unreachable, the box says so and the application
   waits, like the agreement. When the API refuses because either wording
   moved on, the wizard calls router.refresh() and this page re-reads both.
   -------------------------------------------------------------------------- */

async function collabAgreement(): Promise<CollabAgreement | null> {
  try {
    const res = await publicApi("/public/agreements/collab");
    return res.ok ? ((await res.json()) as CollabAgreement) : null;
  } catch {
    return null;
  }
}

async function rulesWording(): Promise<ApiRulesWording | null> {
  try {
    const res = await publicApi("/public/rules-attestation");
    return res.ok ? ((await res.json()) as ApiRulesWording) : null;
  } catch {
    return null;
  }
}

export default async function JoinApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const d = demo === "submitted" ? "submitted" : demo === "minor" ? "minor" : null;
  const [agreement, rules] = await Promise.all([collabAgreement(), rulesWording()]);

  return <JoinWizard demo={d} agreement={agreement} rules={rules} />;
}
