import { RecordSkeleton } from "@/components/record-stage";

import "@/app/(app)/admin/applications/(queue)/applications.css";
import "@/app/(app)/admin/record.css";

/* One guardian sign-up's loading screen (POL-FE-108): the stage's dark ground with a skeleton in
   the record page's own shape (the name, the next-step card, four tiles, the
   tabs and a block of rows), so opening one never flashes a generic skeleton. */
export default function Loading() {
  return <RecordSkeleton label="Loading the sign-up" />;
}
