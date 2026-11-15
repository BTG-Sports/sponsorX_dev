import { currentUser } from "@clerk/nextjs/server";

/* --------------------------------------------------------------------------
   Who the portal chrome greets (F-06, QA pass 5).

   The admin header read "BTG Operations / BTG_ADMIN" for every role — a
   FINANCE user was told they were an admin. The sponsor layout fixed its own
   copy of this on 2026-09-28; this is the shared version: the person's name
   from Clerk (email when no name is set, never a fixture), and their actual
   roles from Postgres (the Actor requirePortalAccess resolved).
   -------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  BTG_ADMIN: "BTG Admin",
  CAMPAIGN_MGR: "Campaign Manager",
  NETWORK_MGR: "Athlete Network Manager",
  FINANCE: "Finance",
  SALES: "Sales",
  SPONSOR_ADMIN: "Sponsor Admin",
  SPONSOR_ANALYST: "Sponsor Analyst",
  PROPERTY_MGR: "Property Manager",
  ATHLETE: "Athlete",
  GUARDIAN: "Guardian",
  ADVISOR: "Advisor",
  STUDENT: "Student",
  SERVICE: "Service account",
};

/** "Finance · Sales" — every role held, in words, in the order held. */
export function roleLabel(roles: readonly string[]): string {
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ") || "No role";
}

/**
 * POL-FE-47 — the signed-in person's name and sign-in email, from Clerk, to
 * fill in checkout's billing contact when the sponsor has none on file. Name
 * is "" when none is set. Null when nobody is signed in or Clerk can't say.
 * Read live, never stored: what an order keeps is what the sponsor confirms.
 */
export async function viewerContact(): Promise<{ name: string; email: string } | null> {
  try {
    const user = await currentUser();
    if (!user) return null;
    return {
      name: [user.firstName, user.lastName].filter(Boolean).join(" "),
      email: user.primaryEmailAddress?.emailAddress ?? "",
    };
  } catch {
    return null;
  }
}

/** The signed-in person's display name, from Clerk. */
export async function viewerName(fallback: string): Promise<string> {
  const user = await currentUser();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name || user?.primaryEmailAddress?.emailAddress || fallback;
}
