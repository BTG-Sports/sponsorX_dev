import { EmptyState } from "@/components/states";
import { accessFor } from "@/lib/admin-access";
import { roleLabel } from "@/server/viewer";
import { fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   "Not in your role" (check pass C-1, 2026-09-29). What a signed-in staff
   member sees on a desk their role isn't for — instead of the sample desk
   (fixtures behind a "Demo data" notice) the page used to fall back to.
   -------------------------------------------------------------------------- */

/**
 * The roles to name when a signed-in staff actor can't use `path`, or null
 * when they can (or aren't signed-in staff — the demo stays theirs).
 */
export async function staffWithoutAccess(path: string): Promise<string[] | null> {
  const a = accessFor(path);
  if (!a) return null;
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  const roles = who.actor.roles;
  if (roles.some((r) => a.roles.includes(r))) return null;
  return roles;
}

export function NotInRole({ path, title, roles }: { path: string; title: string; roles: string[] }) {
  const a = accessFor(path);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <EmptyState
        mark="users"
        title="Not in your role"
        hint={`This desk is for ${a?.who ?? "other BTG roles"}. You're signed in as ${roleLabel(roles)}. If you need it, ask a BTG admin to add the role.`}
        action={{ label: "Back to the Operations Board", href: "/admin" }}
      />
    </div>
  );
}
