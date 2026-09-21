/* --------------------------------------------------------------------------
   Mock sign-in — TEMPORARY, delete when Clerk lands.

   This is not authentication. There is no session, no token and no server
   check; the form matches an email against this list and navigates. Anyone
   can reach any portal by typing the URL, exactly as before.

   What it does demonstrate is §9.2's *role-aware routing* requirement: the
   destination depends on the actor's role, not on which login page they used.
   When Clerk goes in, this list is replaced by the `requireActor()` lookup in
   guide §04 — Clerk gives the identity, the Postgres User row gives the
   tenant and roles.
   -------------------------------------------------------------------------- */

export type MockAccount = {
  email: string;
  /** Role name from §8's twelve. */
  role: string;
  /** Who they are acting for. */
  org: string;
  person: string;
  /** Where role-aware routing sends them after sign-in. */
  destination: string;
};

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    email: "sponsor@example.com",
    role: "SPONSOR_ADMIN",
    org: "Under Armour",
    person: "John Smith",
    destination: "/sponsor",
  },
  {
    email: "athlete@example.com",
    role: "ATHLETE",
    org: "SponsorX Athlete Network",
    person: "Shammah Kwizera",
    destination: "/athlete",
  },
  {
    email: "admin@example.com",
    role: "BTG_ADMIN",
    org: "BTG Sports Group",
    person: "BTG Operations",
    destination: "/admin",
  },
  {
    email: "property@example.com",
    role: "PROPERTY_MGR",
    org: "BTG Sports Talk",
    person: "Property Manager",
    destination: "/property",
  },
];

/** Any password is accepted — see the note at the top of this file. */
export function resolveMockAccount(email: string): MockAccount | undefined {
  const needle = email.trim().toLowerCase();
  return MOCK_ACCOUNTS.find((a) => a.email === needle);
}
