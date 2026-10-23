/* --------------------------------------------------------------------------
   P8-FE-03 / P8-FE-04 / P8-FE-07 — the two confirmations an athlete owes
   before a new deal: that they follow their own school, league and local
   rules (P8-BE-02), and that they accept the current Content Collaboration
   Agreement (P8-BE-04). An adult confirms on the application or from their
   login; a minor's guardian confirms on the guardian page or acting for
   them. A minor's own tick doesn't count.

     GET  /public/rules-attestation            { version, text }
     GET  /me/rules-attestation                 the athlete's standing (below)
     POST /me/rules-attestation { version }     confirm from the portal
     GET  /me/collab-agreement                  the athlete's standing (below)
     POST /agreements/accept { agreementId, bodyHashShown }

   Refusals the screens turn into a prompt:
     422 rules_attestation_stale      the wording moved on — reload, ask again
     409 rules_attestation_required   BTG's switch is on and nothing counts yet
     409 collab_agreement_required    same, for the agreement
     422 not_collab_agreement         the id sent isn't the collab agreement
     409 bad_request "…text has changed…"  (agreement.ts sets no code)
     403 guardian_must_act            a minor's own login — the guardian does it

   Pure: shapes, wording and the refusal → prompt mapping.
   -------------------------------------------------------------------------- */

/** GET /public/rules-attestation (domain/rules-attestation.ts). */
export type ApiRulesWording = { version: string; text: string };

export type RulesVia = "APPLICATION" | "PORTAL" | "GUARDIAN_SETUP" | "GUARDIAN_PORTAL";

/** GET and POST /me/rules-attestation. */
export type ApiMyRules = ApiRulesWording & {
  attestedAt: string | null;
  attestedVersion: string | null;
  attestedVia: RulesVia | null;
  /** The stored version is the current one (and, for a minor, came from the guardian). */
  current: boolean;
  /** BTG's requireRulesAttestation switch is on for this tenant. */
  required: boolean;
  /** A guardian controls this athlete; the minor's own tick doesn't count. */
  byGuardian: boolean;
};

/** GET /public/agreements/collab and the body of GET /me/collab-agreement. */
export type ApiCollabWording = { agreementId: string; version: number; bodyHash: string; body: string };

/** GET /me/collab-agreement (domain/collab-agreement.ts). */
export type ApiMyCollab = ApiCollabWording & {
  acceptedAt: string | null;
  current: boolean;
  required: boolean;
  byGuardian: boolean;
};

/* ---------------------------------------------------------------- codes */

export const RULES_STALE = "rules_attestation_stale";
export const RULES_REQUIRED = "rules_attestation_required";
export const COLLAB_REQUIRED = "collab_agreement_required";
export const NOT_COLLAB = "not_collab_agreement";
export const GUARDIAN_MUST_ACT = "guardian_must_act";

/* -------------------------------------------------------------- wording */

export const RULES_WORDS = {
  title: "Your own rules",
  /** The tick box line, after the wording itself. */
  checkbox: (version: string) => `I confirm this (rules wording ${version}).`,
  /** The guardian's line on their page, confirming for the minor. */
  guardianCheckbox: (name: string, version: string) =>
    `I confirm this for ${name} as their parent, legal guardian or authorised representative (rules wording ${version}).`,
  recordNote: "We record the wording version you confirmed, with the date.",
  unavailable: "The rules wording can't be loaded right now. You can finish the rest; this box waits until it loads.",
  stale: "The rules wording has been updated since you read it. Here is the current wording — please read and confirm it again.",
  /** On a minor's application: the guardian answers this one. */
  guardianAsks: "Because you're under 18, your guardian confirms this on their own page, not here.",
} as const;

export const COLLAB_WORDS = {
  title: "Content Collaboration Agreement",
  checkbox: (version: number) => `I have read and accept the SponsorX Athlete Content Collaboration Agreement (version ${version}).`,
  changed: "The agreement text has changed since you read it. Here is the current version — please read and accept it again.",
  unavailable: "The agreement can't be loaded right now. Try again in a moment.",
} as const;

/* ------------------------------------------------------------- the page */

export const CONFIRMATIONS_PATH = "/athlete/confirmations";

/**
 * A path on this site, and nothing a browser would read as another host:
 * one leading slash, never `//host`, and never `/\host` — a browser treats a
 * backslash after the first slash as a second slash (QA 2026-10-23: a
 * `?return=/\evil.example` link left the site). Tabs and newlines are
 * stripped by the URL parser before it looks, so they are refused too.
 */
export function isSameSitePath(v: unknown): v is string {
  return typeof v === "string" && /^\/(?![/\\])/.test(v) && !/[\\\t\n\r]/.test(v);
}

/** The portal page that asks for whatever is outstanding, returning afterwards. */
export function confirmationsHref(returnTo?: string | null): string {
  return isSameSitePath(returnTo) ? `${CONFIRMATIONS_PATH}?return=${encodeURIComponent(returnTo)}` : CONFIRMATIONS_PATH;
}

/** A safe place to send the athlete back to after confirming (same-site paths only). */
export function returnPath(raw: string | string[] | undefined, fallback = "/athlete"): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isSameSitePath(v) ? v : fallback;
}

export type ConfirmationKind = "rules" | "collab";

export type Outstanding = {
  kind: ConfirmationKind;
  /** BTG's switch is on: a new deal waits on this. Off: it's asked, not enforced. */
  required: boolean;
  /** The guardian does this, not the athlete's own login. */
  byGuardian: boolean;
};

/** What the athlete (or the guardian acting for them) still has to confirm. */
export function outstanding(
  rules: Pick<ApiMyRules, "current" | "required" | "byGuardian"> | null,
  collab: Pick<ApiMyCollab, "current" | "required" | "byGuardian"> | null,
): Outstanding[] {
  const out: Outstanding[] = [];
  if (rules && !rules.current) out.push({ kind: "rules", required: rules.required, byGuardian: rules.byGuardian });
  if (collab && !collab.current) out.push({ kind: "collab", required: collab.required, byGuardian: collab.byGuardian });
  return out;
}

/** The one-line banner on the athlete's home while something is outstanding. */
export function outstandingWords(items: Outstanding[], viewerIsGuardian: boolean): { title: string; text: string } | null {
  if (items.length === 0) return null;
  const names = items.map((i) => (i.kind === "rules" ? "your own rules" : "the Content Collaboration Agreement"));
  const what = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0];
  const required = items.some((i) => i.required);
  const minorsOwnLogin = items.some((i) => i.byGuardian) && !viewerIsGuardian;
  if (minorsOwnLogin) {
    return {
      title: "Your guardian has something to confirm",
      text: `Your guardian confirms ${what} from their own login${required ? " before you can take a new deal" : ""}.`,
    };
  }
  const who = viewerIsGuardian ? "the athlete's" : "your";
  return {
    title: required ? "Confirm before your next deal" : "One thing to confirm",
    text: `Please confirm ${what.replace(/^your own/, `${who} own`)}${required ? " — a new deal waits until you do" : ""}.`,
  };
}

/* ------------------------------------------------------------- refusals */

/** The error body the API sends ({ error: { code, message } }). */
export type ApiErrorBody = { error?: { code?: string; message?: string } } | null | undefined;

/** Which prompt a refusal leads to, or null when it's something else. */
export function promptFor(status: number, body: ApiErrorBody): ConfirmationKind | null {
  const code = body?.error?.code ?? "";
  if (status === 409 && code === RULES_REQUIRED) return "rules";
  if (status === 409 && code === COLLAB_REQUIRED) return "collab";
  return null;
}

/** The wording moved on under the user: show it again and ask again. */
export function wordingMoved(status: number, body: ApiErrorBody): ConfirmationKind | null {
  const code = body?.error?.code ?? "";
  const msg = (body?.error?.message ?? "").toLowerCase();
  if (status === 422 && code === RULES_STALE) return "rules";
  if (status === 422 && code === NOT_COLLAB) return "collab";
  if (status === 409 && code === "agreement_text_changed") return "collab";
  // agreement.ts's AgreementTextChangedError sets no code, so it arrives as bad_request.
  if (status === 409 && code === "bad_request" && msg.includes("agreement text has changed")) return "collab";
  return null;
}

/** A minor's own login tried to confirm: the guardian does it. */
export function guardianMustAct(status: number, body: ApiErrorBody): boolean {
  return status === 403 && body?.error?.code === GUARDIAN_MUST_ACT;
}
