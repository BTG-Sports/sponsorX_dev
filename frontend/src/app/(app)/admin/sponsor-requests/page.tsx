import { redirect } from "next/navigation";

/* The Sponsor requests desk is gone (2026-11-21): sponsors are listed in New
   accounts, filtered to sponsors. Its server actions (./actions.ts) stay
   here; the sponsor record calls them. */

export default function SponsorRequestsDeskLink() {
  redirect("/admin/new-signups?kind=SPONSOR");
}
