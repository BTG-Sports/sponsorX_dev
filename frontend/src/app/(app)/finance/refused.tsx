import { EmptyState } from "@/components/states";

/* --------------------------------------------------------------------------
   A Finance desk the API refused (P1-ART-25 restructure). The portal admits
   FINANCE only (server/portal.ts), and every desk here is one Finance's API
   reads serve, so this is the backstop for a 403 — a role changed under an
   open session, say — said plainly, with the way home. The admin desks'
   "not in your role" card names admin roles and the Operations Board; this
   one stays in the Finance portal (memory portal-views-stay-in-portal).
   -------------------------------------------------------------------------- */

export function Refused({ title }: { title: string }) {
  return (
    <div className="space-y-5">
      <h1 className="sx-page-title">{title}</h1>
      <EmptyState
        mark="users"
        title="Not in your role"
        hint="SponsorX refused this desk for the roles you're signed in with. If you need it, ask a BTG admin to add the role."
        action={{ label: "Back to the Treasury", href: "/finance" }}
      />
    </div>
  );
}
