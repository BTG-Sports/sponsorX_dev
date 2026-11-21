import { redirect } from "next/navigation";

/* The Onboarding desk is gone (2026-11-21): organizations live in New
   accounts. This keeps every link already sent (BTG's emails, the Closed
   accounts desk, bookmarks) landing on the organization's record. A
   "#documents" or per-document fragment survives the redirect. */

export default async function OnboardingRecordLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/new-signups/organizations/${encodeURIComponent(id)}`);
}
