import { redirect } from "next/navigation";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the property's old in-portal reactivation preview.

   The real page is public, /reactivate (2S1-BE-13), reached by the signed
   link in the closing email — see athlete/settings/reactivate. This path
   sends ?case=btg to the "closed by BTG" preview and anything else to the
   self-closed one.
   -------------------------------------------------------------------------- */

export default async function PropertyReactivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).case;
  redirect(`/reactivate?demo=${(Array.isArray(raw) ? raw[0] : raw) === "btg" ? "btg" : "self"}`);
}
