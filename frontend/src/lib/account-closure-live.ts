import { RETENTION_DAYS, dayOf } from "@/lib/account-live";

/* --------------------------------------------------------------------------
   2S1-FE-08 (close / reactivate half) — closing an account and the public
   reactivation page, as the API answers them (2S1-BE-13).

     POST /me/close                               the settings page's Close account
     GET  /public/account/reactivation/:token     where a closed account stands
     POST /public/account/reactivation/:token     REACTIVATE (self-closed) | REQUEST (closed by BTG)
     POST /public/account/reactivation-link       a fresh link by email

   Pure: the shapes and every word the screens derive. `now` is a parameter.
   The samples exist only for the ?demo= previews, which say they are
   previews and never call the API.
   -------------------------------------------------------------------------- */

/** CLOSED_AT_AGE — ended at coming of age: the athlete's government ID brings it back, not BTG. */
export type ReactivationStanding = "CLOSED_SELF" | "CLOSED_BY_BTG" | "CLOSED_AT_AGE" | "REACTIVATED" | "EXPIRED";

/** GET /public/account/reactivation/:token. */
export type ApiReactivationStatus = {
  standing: ReactivationStanding;
  /** ONBOARDING / INQUIRY: an organisation's application or a sponsor's request rejected before approval (2S1-BE-13). */
  kind: "ATHLETE" | "GUARDIAN" | "PROPERTY" | "SPONSOR" | "ONBOARDING" | "INQUIRY";
  /** A first name, or the organization's name. */
  greeting: string;
  closedAt: string;
  retainUntil: string;
  daysLeft: number;
  requestedAt: string | null;
  requestDeclined: boolean;
  reactivatedAt: string | null;
  recheckNotes: string[];
  /** Where this account signs in again. */
  portalPath: string;
  supportEmail: string;
  /** CLOSED_AT_AGE, the athlete's own account: the coming-of-age page where their government ID brings it back. */
  comingOfAgePath?: string | null;
};

export type ReactivateView =
  | { kind: "self"; badge: string; headline: string; left: string; body: string }
  | { kind: "btg"; badge: string; headline: string; body: string; kept: string; asked: string | null }
  | { kind: "age"; badge: string; headline: string; body: string; kept: string; uploadPath: string | null }
  | { kind: "back"; badge: string; headline: string; notes: string[] }
  | { kind: "expired"; badge: string; headline: string; body: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function reactivateView(s: ApiReactivationStatus): ReactivateView {
  const closed = new Date(s.closedAt);
  const until = new Date(s.retainUntil);
  switch (s.standing) {
    case "REACTIVATED":
      return { kind: "back", badge: "Active again", headline: `${s.greeting}, your account is back.`, notes: s.recheckNotes };
    case "EXPIRED":
      return {
        kind: "expired",
        badge: "Closed",
        headline: `The ${RETENTION_DAYS} days have passed`,
        body: "Your documents have been deleted. To come back, sign up again.",
      };
    case "CLOSED_AT_AGE":
      /* Ended at coming of age: no Reactivate and no "ask BTG" — the
         athlete's government ID, within the 30 days, brings it back. */
      return {
        kind: "age",
        badge: "Ended at coming of age",
        headline: s.kind === "GUARDIAN"
          ? `${s.greeting}, this guardian account ended when your athlete came of age.`
          : `${s.greeting}, your account ended because no government ID came in within the 90 days.`,
        body: s.kind === "GUARDIAN"
          ? `There’s nothing to reactivate here. Your athlete can bring their own account back by uploading their government ID by ${dayOf(until)}, from the coming-of-age link we emailed them — BTG doesn’t need to review it.`
          : s.comingOfAgePath
            ? `Upload your government ID by ${dayOf(until)} and your account comes back — no need to ask BTG.`
            : `Upload your government ID by ${dayOf(until)} from the coming-of-age link we emailed you, and your account comes back — no need to ask BTG.`,
        kept: `Your documents are kept until ${dayOf(until)}, then deleted.`,
        uploadPath: s.kind === "GUARDIAN" ? null : s.comingOfAgePath ?? null,
      };
    case "CLOSED_BY_BTG":
      return {
        kind: "btg",
        badge: "Closed by BTG",
        headline: "Your account was closed by BTG — ask BTG to review it.",
        body: "You can’t reactivate it yourself. The reason was in the email BTG sent you. If you think it’s wrong, tell us and a person will look again.",
        kept: `Your documents are kept until ${dayOf(until)}, then deleted.`,
        asked: s.requestedAt
          ? s.requestDeclined
            ? `BTG looked again and replied by email on ${dayOf(s.requestedAt)}. You can ask once more if you have something new.`
            : `You asked BTG on ${dayOf(s.requestedAt)}. A person at BTG will reply by email.`
          : null,
      };
    default:
      return {
        kind: "self",
        badge: "Closed · you can reactivate",
        headline: `${s.greeting}, your account closed on ${dayOf(closed)}.`,
        left: `${plural(s.daysLeft, "day")} left`,
        body: `Reactivate by ${dayOf(until)} and everything comes back: your profile, your items and your documents. After that, your documents are deleted.`,
      };
  }
}

/* ---------------------------------------------------------------- previews */

const DAY = 86_400_000;

/** ?demo=self | btg — closed 7 days ago ("23 days left", as the design shows). */
export function sampleReactivation(standing: "CLOSED_SELF" | "CLOSED_BY_BTG", greeting: string, now = new Date()): ApiReactivationStatus {
  const closedAt = new Date(now.getTime() - 7 * DAY);
  return {
    standing, kind: "ATHLETE", greeting, closedAt: closedAt.toISOString(), retainUntil: new Date(closedAt.getTime() + RETENTION_DAYS * DAY).toISOString(),
    daysLeft: RETENTION_DAYS - 7, requestedAt: null, requestDeclined: false, reactivatedAt: null, recheckNotes: [], portalPath: "/athlete",
    supportEmail: "support@sponsorx.net",
  };
}

export function reactivateDemo(raw: string | string[] | undefined): "self" | "btg" | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "self" || v === "btg" ? v : null;
}

export const PREVIEW_ONLY = "Preview — nothing here is sent.";
