import { OrgRecord } from "@/components/org-record";

import "../../../applications/(queue)/applications.css";
import "../../../record.css";

/* One organization, opened inside New accounts — the record is
   components/org-record.tsx. /admin/onboarding/:id forwards here. */

export const dynamic = "force-dynamic";

export default async function OrganizationRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgRecord id={id} />;
}
