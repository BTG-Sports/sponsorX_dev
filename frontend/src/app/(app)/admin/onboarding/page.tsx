import { redirect } from "next/navigation";

/* The Onboarding desk is gone (2026-11-21): organizations are listed in New
   accounts, filtered to organizations. Its server actions (./actions.ts)
   stay here; the organization record calls them. */

export default function OnboardingDeskLink() {
  redirect("/admin/new-signups?kind=ORGANIZATION");
}
