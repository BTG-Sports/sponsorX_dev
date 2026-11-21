import { redirect } from "next/navigation";

/* The Sponsor requests desk is gone (2026-11-21): sponsors live in New
   accounts. This keeps every link already sent (BTG's emails, the Closed
   accounts desk, bookmarks) landing on the sponsor's record. */

export default async function SponsorRequestLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/new-signups/sponsors/${encodeURIComponent(id)}`);
}
