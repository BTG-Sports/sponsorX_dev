import { SponsorRequestRecord } from "@/components/sponsor-request-record";

import "../../../applications/(queue)/applications.css";
import "../../../record.css";

/* One sponsor, opened inside New accounts — the record is
   components/sponsor-request-record.tsx. /admin/sponsor-requests/:id
   forwards here. */

export const dynamic = "force-dynamic";

export default async function SignupSponsorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SponsorRequestRecord id={id} />;
}
