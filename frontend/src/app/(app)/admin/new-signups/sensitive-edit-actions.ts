"use server";

import { redirect } from "next/navigation";

import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-09 — BTG opens the ID a legal-name change was matched against.

   GET /profile-changes/:id/id-document answers a five-minute presigned link
   to the private bucket, and the API audits the grant. The action asks for
   it at the moment of the click and sends the browser straight there, so
   the link is never rendered into a page where it could sit and be copied.
   -------------------------------------------------------------------------- */

export async function viewEditIdAction(changeId: string): Promise<void> {
  if (typeof changeId !== "string" || !changeId) redirect("/admin/new-signups?id=missing#sensitive-edits");
  const res = await apiFetch(`/profile-changes/${encodeURIComponent(changeId)}/id-document`);
  if (!res.ok) redirect(`/admin/new-signups?id=${res.status}#sensitive-edits`);
  const { url } = (await res.json()) as { url: unknown };
  /* 2S8-SEC-02: a presigned storage link is always absolute https (http only
     for the local MinIO); anything else is not followed. */
  const local = process.env.NODE_ENV !== "production";
  if (typeof url !== "string" || !(/^https:\/\//i.test(url) || (local && /^http:\/\//i.test(url)))) {
    redirect("/admin/new-signups?id=bad-link#sensitive-edits");
  }
  redirect(url);
}
