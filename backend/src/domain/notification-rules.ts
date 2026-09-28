/**
 * Which notifications a user may mute, on which channels — 2S6-BE-02. Pure,
 * so the worker can read it without the API's auth modules.
 */
/** EMAIL is the only channel the worker sends today; the key has room for SMS and push. */
export const CHANNELS = ["EMAIL"] as const;
export type Channel = (typeof CHANNELS)[number];

/** The events a user may mute — offers, reminders, and delivery updates. */
export const MUTABLE_EVENTS = [
  "invitation.sent",
  "invitation.reminder",
  "invitation.expiring",
  "deliverable.dueSoon",
  "deliverable.revisionRequested",
  "deliverable.approved",
  "student.prospectDeclined",
] as const;
export type MutableEvent = (typeof MUTABLE_EVENTS)[number];
