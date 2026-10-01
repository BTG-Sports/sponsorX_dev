import { redirect } from "next/navigation";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the athlete's old in-portal reactivation preview.

   The real page is public, /reactivate (2S1-BE-13): the person coming back
   has a closed login and can't sign in, so it is reached by the signed link
   in their email. This path stays only so old links land somewhere: it
   sends ?case=btg to the "closed by BTG" preview and anything else to the
   self-closed one.
   -------------------------------------------------------------------------- */

export default async function AthleteReactivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).case;
  redirect(`/reactivate?demo=${(Array.isArray(raw) ? raw[0] : raw) === "btg" ? "btg" : "self"}`);
}
