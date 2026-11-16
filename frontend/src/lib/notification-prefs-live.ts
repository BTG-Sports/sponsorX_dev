/* --------------------------------------------------------------------------
   POL-FE-75 — email preferences (2S6-BE-02).

     GET /me/notification-preferences   every mutable event × channel, muted or not
     PUT /me/notification-preferences   { event, channel, muted } — the caller's own

   The worker honours a mute at send time. Decision notices (an application's
   outcome, a guardian's authorisation, an organisation's approval) are never
   in the list: they can't be muted. Pure: the words and the grouping.
   -------------------------------------------------------------------------- */

export type ApiPreference = { event: string; channel: string; muted: boolean };

const EVENT_WORDS: Record<string, { label: string; hint: string }> = {
  "invitation.sent": { label: "New campaign invitations", hint: "When a sponsor's campaign invites you." },
  "invitation.reminder": { label: "Invitation reminders", hint: "A nudge about an invitation you haven't answered." },
  "invitation.expiring": { label: "Invitations about to expire", hint: "The last notice before an invitation closes." },
  "deliverable.dueSoon": { label: "Posts due soon", hint: "A reminder before a post is due." },
  "deliverable.revisionRequested": { label: "Changes asked for", hint: "When a reviewer asks you to change a post." },
  "deliverable.approved": { label: "Posts approved", hint: "When a post you sent is approved." },
  "student.prospectDeclined": { label: "Prospects that said no", hint: "When a business you reached out to declines." },
};

/** An event in plain words; an unknown one keeps its name rather than vanish. */
export function eventWords(event: string): { label: string; hint: string } {
  return EVENT_WORDS[event] ?? { label: event, hint: "" };
}

/** The email rows only (the one channel today), in the API's order. */
export function emailRows(prefs: readonly ApiPreference[]): Array<ApiPreference & { label: string; hint: string }> {
  return prefs.filter((p) => p.channel === "EMAIL").map((p) => ({ ...p, ...eventWords(p.event) }));
}

export const ALWAYS_SENT_LINE =
  "Emails about a decision on your account — an application's outcome, a guardian's authorisation, an approval — always reach you and can't be turned off.";
