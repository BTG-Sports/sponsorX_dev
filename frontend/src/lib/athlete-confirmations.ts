/* --------------------------------------------------------------------------
   P8-FE-04 / P8-FE-07 — the athlete portal's confirmations page
   (/athlete/confirmations) and its server actions. Pure: who the viewer is
   to each card, what each card shows, and how a refusal becomes a result
   the form can act on. The shapes, the wording and the refusal codes are
   confirmations-live.ts's; nothing here repeats them.

   Three seats look at the same two cards:
     - an adult athlete            confirms from their own login;
     - a guardian acting for a minor (actingFor set) confirms for them,
                                   named — "I confirm this for Ana …";
     - a minor's own login         sees that the guardian does it. No tick
                                   box, no button; the API would refuse it
                                   anyway (403 guardian_must_act).
   -------------------------------------------------------------------------- */

import {
  COLLAB_WORDS,
  RULES_WORDS,
  guardianMustAct,
  wordingMoved,
  type ApiErrorBody,
  type ApiMyCollab,
  type ApiMyRules,
  type ConfirmationKind,
} from "./confirmations-live";

/* --------------------------------------------------------------- viewer */

/** The part of GET /me the page reads (server/api.ts Actor). */
export type ViewerActor = {
  actingFor?: string | null;
  wards?: { athleteId: string; displayName: string }[];
  guardianControl?: { guardianName: string | null } | null;
};

export type Viewer = {
  /** A guardian confirming for the athlete they act for. */
  actingForWard: boolean;
  /** The ward's name on the guardian's tick line. */
  wardName: string;
  /** The guardian's name on a minor's own card. */
  guardianName: string;
};

export function viewerOf(actor: ViewerActor): Viewer {
  const ward = actor.actingFor ? (actor.wards ?? []).find((w) => w.athleteId === actor.actingFor) : undefined;
  return {
    actingForWard: Boolean(actor.actingFor),
    wardName: ward?.displayName?.trim() || "the athlete",
    guardianName: actor.guardianControl?.guardianName?.trim() || "Your guardian",
  };
}

/* ---------------------------------------------------------------- cards */

export type CardMode =
  /** The stored confirmation is the current wording: quiet. */
  | "confirmed"
  /** Show the wording, the tick line and the button. */
  | "ask"
  /** A minor's own login: the guardian confirms from their own login. */
  | "guardianDoes"
  /** The standing couldn't be read. */
  | "unavailable";

export function cardMode(standing: Pick<ApiMyRules, "current" | "byGuardian"> | null, viewer: Pick<Viewer, "actingForWard">): CardMode {
  if (!standing) return "unavailable";
  if (standing.current) return "confirmed";
  if (standing.byGuardian && !viewer.actingForWard) return "guardianDoes";
  return "ask";
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Confirmed on Oct 3, 2026 · wording 2026-09" for a quiet, current card. */
export function confirmedLine(at: string | null, version: string | number, kind: ConfirmationKind): string {
  const v = kind === "rules" ? `rules wording ${version}` : `agreement version ${version}`;
  return at ? `Confirmed on ${day(at)} · ${v}` : `Confirmed · ${v}`;
}

/** The tick line, by seat. */
export function tickLine(kind: ConfirmationKind, version: string | number, viewer: Viewer): string {
  if (kind === "rules") {
    return viewer.actingForWard ? RULES_WORDS.guardianCheckbox(viewer.wardName, String(version)) : RULES_WORDS.checkbox(String(version));
  }
  const n = Number(version);
  return viewer.actingForWard
    ? `I have read and accept the SponsorX Athlete Content Collaboration Agreement (version ${n}) for ${viewer.wardName}, as their parent, legal guardian or authorised representative.`
    : COLLAB_WORDS.checkbox(n);
}

/** What a minor's own login reads instead of the tick box. */
export function guardianDoesLine(viewer: Pick<Viewer, "guardianName">, required: boolean): string {
  return `${viewer.guardianName} confirms this from their own login${required ? " — a new deal waits until they do" : ""}.`;
}

/** The "a new deal waits on this" note while BTG's switch is on. */
export function requiredLine(standing: Pick<ApiMyRules | ApiMyCollab, "required">, viewer: Pick<Viewer, "actingForWard">): string | null {
  if (!standing.required) return null;
  return viewer.actingForWard ? "A new deal for them waits until this is confirmed." : "A new deal waits until you confirm this.";
}

/* -------------------------------------------------------------- results */

/** What a confirmation action hands back to the form. On `ok` the page
 *  re-reads; `reload` says the page must re-read before asking again. */
export type ConfirmResult = { ok: true; message?: string } | { ok: false; message: string; reload?: boolean };

const ALREADY = /already (accepted|confirmed|attested)/i;

/** A refused POST, as a result. The order matters: a moved wording is a
 *  reload; "already accepted" is as good as done; a minor's own login gets
 *  the API's own sentence; anything else the API's message or `fallback`. */
export function refusalResult(kind: ConfirmationKind, status: number, body: ApiErrorBody, fallback: string): ConfirmResult {
  const apiMessage = body?.error?.message?.trim() || "";
  if (wordingMoved(status, body) === kind) {
    return { ok: false, message: kind === "rules" ? RULES_WORDS.stale : COLLAB_WORDS.changed, reload: true };
  }
  if (status === 409 && ALREADY.test(apiMessage)) {
    return { ok: true, message: "This was already confirmed. Here is where it stands now." };
  }
  if (guardianMustAct(status, body)) return { ok: false, message: apiMessage || RULES_WORDS.guardianAsks };
  return { ok: false, message: apiMessage || fallback };
}
