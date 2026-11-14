import "server-only";

import { mayUse } from "@/lib/admin-access";
import { supportNavCount } from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-41 — the number on the admin menu's Support entry: how many
   messages are New. Asked only for the roles that may open the inbox (BTG
   admin, super admin), as one row of one page — the API's counts come with
   it. Anything going wrong just means no number: the menu never waits on it
   or breaks because of it.
   -------------------------------------------------------------------------- */

export async function newSupportCount(roles: readonly string[]): Promise<number | null> {
  if (!mayUse("/admin/support", roles)) return null;
  try {
    const res = await apiFetch("/support-messages?status=NEW&page=1&size=1");
    if (!res.ok) return null;
    return supportNavCount(await res.json());
  } catch {
    return null;
  }
}
