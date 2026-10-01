import { redirect } from "next/navigation";

/* --------------------------------------------------------------------------
   Profile changes — RETIRED by 2S1-FE-09 (2026-10-01).

   This was BTG's review desk for post-approval profile edits (P3-BE-16).
   2S1-BE-14 removed its purpose: edits publish at once, and BTG approves
   none of them. BTG is told only about SENSITIVE edits — a legal name, a
   date of birth, a guardian — and sees them on New sign-ups, where Reject
   is. The approve and decline routes are gone from the API.

   The path stays only so an old link or bookmark lands on the right page.
   -------------------------------------------------------------------------- */

export default function ProfileChangesRetired() {
  redirect("/admin/new-signups#sensitive-edits");
}
