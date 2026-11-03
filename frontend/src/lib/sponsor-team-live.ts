/* --------------------------------------------------------------------------
   POL-FE-19 — the sponsor's Team page (/sponsor/team): a Sponsor Admin
   invites colleagues, sets each one's role, resends an unused invite and
   removes people. Pure: the wire shapes, the words, the chip tones, the
   refusals and the email check. No React, no fetch.

   LIVE since POL-BE-19 (backend/src/domain/sponsor-team.ts):
     GET   /sponsor/team              { sponsorName, members }  SPONSOR_ADMIN only
     POST  /sponsor/team              { email, role }  201       invites and emails
     PATCH /sponsor/team/:id          { role }                   admin ↔ viewer
     POST  /sponsor/team/:id/resend   202                        an unused invite again
     POST  /sponsor/team/:id/remove                              cancel an invite / switch a login off

   The API keeps the order (active first, admins before viewers) — the page
   never re-sorts. An invite is a login waiting to be claimed (`INVITED`
   until the first sign-in with that address); a removed member's login is
   switched off and their history stays. Re-adding a removed person is not
   built — their login still exists, and BTG can switch it back on — so the
   Removed row says so instead of offering an action. An admin never changes
   or removes themselves (422), so a sponsor always keeps an admin.
   -------------------------------------------------------------------------- */

import type { Word } from "@/lib/sponsor-words";

export const TEAM_ROLES = ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const MEMBER_STATUSES = ["INVITED", "ACTIVE", "REMOVED"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** One person on the team, as GET /sponsor/team describes them. */
export type ApiTeamMember = {
  id: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  addedAt: string;
  /** The signed-in admin's own row — no actions on it. */
  you: boolean;
};

export type ApiSponsorTeam = { sponsorName: string; members: ApiTeamMember[] };

/** The API's two roles in a sponsor's words: an Admin does everything the account may; a Viewer reads. */
export function roleWord(role: TeamRole): "Admin" | "Viewer" {
  return role === "SPONSOR_ADMIN" ? "Admin" : "Viewer";
}

/** The one line under each role choice. */
export function roleHint(role: TeamRole): string {
  return role === "SPONSOR_ADMIN"
    ? "Everything your account can do — campaigns, orders, billing and this team."
    : "Read only: sees campaigns, orders and invoices; changes nothing.";
}

/** The role a member would switch to. */
export function otherRole(role: TeamRole): TeamRole {
  return role === "SPONSOR_ADMIN" ? "SPONSOR_ANALYST" : "SPONSOR_ADMIN";
}

/** The status chip: Invited (hasn't signed in yet) · Active · Removed. */
export function statusWord(status: MemberStatus): Word {
  switch (status) {
    case "INVITED": return { text: "Invited", tone: "info" };
    case "ACTIVE": return { text: "Active", tone: "live" };
    case "REMOVED": return { text: "Removed", tone: "done" };
  }
}

/** What the chip means, in one quiet line. */
export function statusHint(status: MemberStatus): string {
  switch (status) {
    case "INVITED": return "Hasn't signed in yet. The invite email has the link.";
    case "ACTIVE": return "Has signed in.";
    case "REMOVED": return "Login switched off; what they did stays on record. Re-adding isn't built here yet — ask BTG to switch the login back on.";
  }
}

/** A row that takes actions: not you, not removed. */
export function canAct(m: Pick<ApiTeamMember, "you" | "status">): boolean {
  return !m.you && m.status !== "REMOVED";
}

/** The row's actions, in order — none for you or for a removed person. */
export function memberActions(m: Pick<ApiTeamMember, "you" | "status" | "role">): ("role" | "resend" | "remove")[] {
  if (!canAct(m)) return [];
  return m.status === "INVITED" ? ["role", "resend", "remove"] : ["role", "remove"];
}

/**
 * Why a typed address can't be sent, or null when it can. The API's own
 * check (z.email, 100 chars) is the real one; this only saves a round trip.
 */
export function emailProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Type their email address.";
  if (v.length > 100) return "That address is too long.";
  if (/\s/.test(v) || !/^[^@]+@[^@]+\.[^@]+$/.test(v)) return "That doesn't look like an email address.";
  return null;
}

/** The address as the API stores it. */
export function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Words for a refused team write. `said` is the API's own message, used
 * where it says something more exact than the status (a 409 can be "already
 * has a login", "already removed" or "not an unused invite").
 */
export function teamRefusal(status: number, said?: string | null): string {
  const s = typeof said === "string" && said.trim() ? said.trim() : null;
  switch (status) {
    case 400: return s ?? "Check the address and try again.";
    case 403: return "Only a Sponsor Admin can manage the team.";
    case 404: return "That person isn't on your team any more. Refresh the page.";
    case 409: return s ?? "That address already has a SponsorX login.";
    case 422: return "You can't change your own access. Ask another admin.";
    case 429: return "Too many tries. Try again in an hour.";
    default: return s ?? `Nothing was changed (HTTP ${status}).`;
  }
}

/** The "are you sure?" before a removal, by what removing does. */
export function removeDialog(m: Pick<ApiTeamMember, "email" | "status">): { title: string; line: string; button: string } {
  if (m.status === "INVITED") {
    return {
      title: `Cancel the invite to ${m.email}?`,
      line: "The invite stops working and they won't be able to sign in with it. You can invite the address again later.",
      button: "Cancel the invite",
    };
  }
  return {
    title: `Remove ${m.email}?`,
    line: "Their login is switched off at once and what they did stays on record. Re-adding them isn't built here yet — BTG can switch the login back on.",
    button: "Remove",
  };
}

/** The status line after a write that worked. */
export function doneLine(what: "invite" | "role" | "resend" | "remove", m: Pick<ApiTeamMember, "email" | "status" | "role">): string {
  switch (what) {
    case "invite": return `Invite sent to ${m.email}. They're ${roleWord(m.role) === "Admin" ? "an Admin" : "a Viewer"} once they sign in.`;
    case "role": return `${m.email} is now ${roleWord(m.role) === "Admin" ? "an Admin" : "a Viewer"}.`;
    case "resend": return `Invite sent again to ${m.email}.`;
    case "remove": return m.status === "INVITED" ? `The invite to ${m.email} is cancelled.` : `${m.email} is removed. Their login is switched off.`;
  }
}

/** The section line: "3 people · 1 invite waiting", from the list the API gave (it is the whole team, never a page). */
export function teamSummary(members: readonly Pick<ApiTeamMember, "status">[]): string {
  const active = members.filter((m) => m.status === "ACTIVE").length;
  const invited = members.filter((m) => m.status === "INVITED").length;
  const removed = members.filter((m) => m.status === "REMOVED").length;
  const parts = [`${active} ${active === 1 ? "person" : "people"}`];
  if (invited) parts.push(`${invited} ${invited === 1 ? "invite" : "invites"} waiting`);
  if (removed) parts.push(`${removed} removed`);
  return parts.join(" · ");
}
