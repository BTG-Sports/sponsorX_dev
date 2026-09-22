/**
 * The invitation lifecycle — P4-BE-04, §21.
 *
 * INVITED → VIEWED → ACCEPTED / DECLINED, and EXPIRED from either open state.
 *
 * VIEWED IS NOT SKIPPABLE ON THE WAY TO ACCEPTED, but an athlete can decline
 * without opening: the accept path runs through the screen that shows them
 * the terms, and the decline path can be a link in an email. Modelling that
 * asymmetry is the point — "they accepted without ever seeing it" should not
 * be representable.
 *
 * EXPIRED IS TERMINAL AND RE-INVITING IS NORMAL. An expiry is not a bar: the
 * athlete may be invited again, which is why the schema has a *partial*
 * unique index over the open states rather than a full one. The rule is "no
 * two live offers for the same work", not "one offer ever".
 */

export type InviteState = "INVITED" | "VIEWED" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export const INVITE_STATES: readonly InviteState[] = [
  "INVITED", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED",
] as const;

/** The states that hold a live offer. The partial unique index in
 *  prisma/sql/invite_one_open.sql covers exactly these. */
export const OPEN_INVITE_STATES: readonly InviteState[] = ["INVITED", "VIEWED"] as const;

const TRANSITIONS: Readonly<Record<InviteState, readonly InviteState[]>> = {
  INVITED: ["VIEWED", "DECLINED", "EXPIRED"],
  VIEWED: ["ACCEPTED", "DECLINED", "EXPIRED"],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
};

export class IllegalInviteTransitionError extends Error {
  readonly status = 409;
  constructor(from: InviteState, to: InviteState) {
    super(
      `An invitation cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalInviteTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalInviteTransitionError";
  }
}

export function canTransitionInvite(from: InviteState, to: InviteState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalInviteTransitions(from: InviteState): readonly InviteState[] {
  return TRANSITIONS[from];
}

export function isOpenInvite(state: InviteState): boolean {
  return OPEN_INVITE_STATES.includes(state);
}
