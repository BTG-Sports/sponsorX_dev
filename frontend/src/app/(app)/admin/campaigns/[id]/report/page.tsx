/* POL-FE-60 (app review §2) — BTG's "Sponsor report" bounced BTG to /admin:
   the report lived only under /sponsor, whose layout admits sponsor roles.
   The report page already reads for BTG's roles (REPORT_ROLES), so the same
   page is served here, inside the admin portal. ?from=admin-campaign brings
   BTG back to the campaign page. */
export { default } from "@/app/(app)/sponsor/campaigns/[id]/report/page";

export const dynamic = "force-dynamic";
