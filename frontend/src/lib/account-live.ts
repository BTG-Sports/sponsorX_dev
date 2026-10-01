import type { AccountPanelView } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   2S1-FE-08 — account settings, closing and reactivating an account, and
   the coming-of-age reminder (Claude Design Account.dc.html, views
   settings / close / reactivate / rejected / ageAthlete / ageGuardian).

   WIRED: the sign-in email (Clerk — the identity is Clerk's; GET /me
   carries roles, not the address), the payout account
   (GET /payouts/account → payouts-live accountPanel), and closing an
   account (POST /me/close, 2S1-BE-13). The public reactivation page's
   shapes and words are in account-closure-live.ts.

   SCAFFOLD, typed like the future API:
     2S1-BE-12  age of majority by place, and the 90-day coming-of-age
                allowance (the reminder, and what is paused meanwhile)

   The rules the copy states (programme owner, 2026-10-01): a closed or
   rejected account's files are kept 30 days, then deleted; a self-closed
   account can reactivate itself within those 30 days; a rejected one asks
   BTG and BTG decides; money already earned is still paid out. Coming of
   age gives 90 days to upload a government ID; meanwhile no new items or
   deals, and orders already agreed carry on.

   Pure: every word and count the screens derive. The samples are built
   from `now`, so their countdowns stay sensible on any day they're shown.
   -------------------------------------------------------------------------- */

const DAY = 86_400_000;

/** A closed or rejected account's files are kept this long (2S1-BE-13). */
export const RETENTION_DAYS = 30;
/** The coming-of-age allowance to upload a government ID (2S1-BE-12). */
export const ALLOWANCE_DAYS = 90;

/** Why each scaffolded control is off — the button's title and the line under it. */
export const AGE_NOT_LIVE = "Not switched on yet — taking over the account goes live with 2S1-BE-12. Nothing has been sent.";

/* ---------------------------------------------------------------- shapes */

/** 2S1-BE-12 — the coming-of-age allowance, as both sides will read it. */
export type ApiComingOfAge = {
  athleteFirstName: string;
  /** The age of majority of the athlete's state or country. */
  ageOfMajority: number;
  reachedAt: string;
  idUploaded: boolean;
};

/* ---------------------------------------------------------------- shared */

/** "Sep 24" (UTC, so server and test agree). */
export function dayOf(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Whole days from `now` to `until`, never below zero. */
export function daysLeft(until: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY));
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/* ---------------------------------------------------------------- sign-in */

/** "riley@example.com · confirmed" — the Clerk primary address and whether it's verified. */
export function signInLine(email: string | null | undefined, verified: boolean): string {
  if (!email) return "No email on this login";
  return `${email} · ${verified ? "confirmed" : "not confirmed yet"}`;
}

/* ---------------------------------------------------------------- payouts */

/** The settings row under "Payout account": status in words, then who manages it.
 *  The panel's CTA is the button beside it — a Stripe step always has one. */
export function payoutLine(view: AccountPanelView): string {
  return `${view.chip.label} ${view.chip.mark} · managed by Stripe`;
}

/* ---------------------------------------------------------------- closing */

export type Seat = "athlete" | "guardian" | "property";

/** The close row's line, per who is closing. A guardian has no listings. */
export function closeLine(seat: Seat): string {
  return seat === "guardian"
    ? `You can’t sign in. You can come back within ${RETENTION_DAYS} days.`
    : `Your listings end and you can’t sign in. You can come back within ${RETENTION_DAYS} days.`;
}

/** The confirm dialog's words (design "Close your account?"). */
export const CLOSE_DIALOG = {
  title: "Close your account?",
  body: `Your account closes now. Your documents are kept for ${RETENTION_DAYS} days and then deleted. Come back within ${RETENTION_DAYS} days to reactivate everything.`,
  money: "Money you already earned is still paid out to your payout account on Stripe.",
} as const;

/* Reactivating (2S1-BE-13) moved to account-closure-live.ts with the API's shapes. */

/* ------------------------------------------------------------ coming of age */

export type AgeView = {
  title: string;
  line: string;
  cta: string;
  heading: string;
  /** The paused-actions cards: whose ID it waits on. */
  pausedItems: string;
  pausedDeals: string;
  daysLeft: number;
};

/** The reminder, from the athlete's side or the guardian's. Null once the ID is in. */
export function comingOfAgeView(c: ApiComingOfAge, seat: "athlete" | "guardian", now = new Date()): AgeView | null {
  if (c.idUploaded) return null;
  const reached = new Date(c.reachedAt);
  const n = daysLeft(new Date(reached.getTime() + ALLOWANCE_DAYS * DAY), now);
  const who = c.athleteFirstName;
  const left = `${plural(n, "day")} left`;
  if (seat === "guardian") {
    return {
      title: `${who} can now take over the account`,
      line: `${who} turned ${c.ageOfMajority} on ${dayOf(reached)}. Upload a government ID within ${ALLOWANCE_DAYS} days to take over the account — ${left}.`,
      cta: `Send ${who} the link`,
      heading: `${who}’s account`,
      pausedItems: `Paused until ${who} uploads a government ID.`,
      pausedDeals: `Sponsors can’t start new deals with ${who} until the ID is uploaded.`,
      daysLeft: n,
    };
  }
  return {
    title: `You’re ${c.ageOfMajority} — take over your account`,
    line: `You turned ${c.ageOfMajority} on ${dayOf(reached)}. Upload a government ID within ${ALLOWANCE_DAYS} days to take over your account — ${left}.`,
    cta: "Upload government ID",
    heading: `Hi, ${who}`,
    pausedItems: "Paused until you upload a government ID.",
    pausedDeals: "Sponsors can’t start new deals with you until the ID is uploaded.",
    daysLeft: n,
  };
}

/* ---------------------------------------------------------------- samples */

/** Turned 18 eighteen days ago — "72 days left", as the design shows. */
export function sampleComingOfAge(now = new Date()): ApiComingOfAge {
  return { athleteFirstName: "Jordan", ageOfMajority: 18, reachedAt: new Date(now.getTime() - 18 * DAY).toISOString(), idUploaded: false };
}
