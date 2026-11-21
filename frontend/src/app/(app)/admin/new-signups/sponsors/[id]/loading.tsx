import { RecordSkeleton } from "@/components/record-stage";

import "@/app/(app)/admin/applications/(queue)/applications.css";
import "@/app/(app)/admin/record.css";

/* One sponsor sign-up's loading screen: a skeleton in the record page's own
   shape (the name and its button, four tiles, the tabs, a block of rows). */
export default function Loading() {
  return <RecordSkeleton label="Loading the sponsor request" />;
}
