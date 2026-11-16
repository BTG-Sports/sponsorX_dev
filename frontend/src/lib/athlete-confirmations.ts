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
export function requiredLine(standing: Pick<ApiMyRules | ApiMyCollab, "required" | "byGuardian">, viewer: Pick<Viewer, "actingForWard">): string | null {
  if (!standing.required) return null;
  /* A minor's own login reads guardianDoesLine instead, which already says a deal waits (QA round, 2026-10-23). */
  if (standing.byGuardian && !viewer.actingForWard) return null;
  return viewer.actingForWard ? "A new deal for them waits until this is confirmed." : "A new deal waits until you confirm this.";
}

/* --------------------------------------------------------------- wizard */

/* The page is a wizard (2026-11-16 redesign): an intro, one step per
   confirmation, then "all set". Each step is in one of four states. */
export type StepState = "done" | "todo" | "guardian" | "unavailable";

export function stepState(mode: CardMode): StepState {
  return mode === "confirmed" ? "done" : mode === "ask" ? "todo" : mode === "guardianDoes" ? "guardian" : "unavailable";
}

/** The step to go to after `after` (-1 = from the start): the next one the
 *  viewer can act on, else the next one not done (a guardian's or an
 *  unavailable one, so they read why), wrapping round. -1 when all are done. */
export function nextStep(states: StepState[], after = -1): number {
  const order = states.map((_, k) => (after + 1 + k) % states.length);
  const todo = order.find((i) => states[i] === "todo");
  if (todo !== undefined) return todo;
  const open = order.find((i) => states[i] !== "done");
  return open ?? -1;
}

/** Minutes to read `text` at an easy 220 words a minute, never under one. */
export function readMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export type AgreementSection = { heading: string | null; paragraphs: string[] };

/* A numbered heading on a line of its own: "3. CAMPAIGN ORDERS". */
const SECTION_HEADING = /^\d{1,2}\.\s+[^a-z\n]+$/;

/** The agreement split into its numbered sections, for the reader. Only the
 *  blank lines between paragraphs are dropped — every word stays, in order
 *  (the accepted hash is of the server's text; this is how it's shown). The
 *  part before the first heading is a section with no heading. */
export function agreementSections(body: string): AgreementSection[] {
  const blocks = body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: AgreementSection[] = [];
  for (const b of blocks) {
    if (SECTION_HEADING.test(b)) out.push({ heading: b, paragraphs: [] });
    else if (out.length === 0) out.push({ heading: null, paragraphs: [b] });
    else out[out.length - 1].paragraphs.push(b);
  }
  return out;
}

/** "3. CAMPAIGN ORDERS" → "Campaign orders", for the reader's section chips. */
export function sectionChip(heading: string): string {
  const words = heading.replace(/^\d{1,2}\.\s+/, "").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
