/* --------------------------------------------------------------------------
   P4-FE-08 — campaigns move through their stages by themselves (P4-BE-09).

   The API says what happens next (`nextStep`, in BTG's words for the desk
   and in plain words for a sponsor) and whether the latest stage change was
   made by the system (`stageChange.movedAutomatically`, read from the audit).
   These helpers turn that into the lines the screens show; they never invent
   a step the API didn't send.
   -------------------------------------------------------------------------- */

export type NextStepWho = "BTG" | "SYSTEM" | "ATHLETES" | "SPONSOR";
export type NextStep = { who: NextStepWho; text: string };
export type StageChange = { state: string; at: string; movedAutomatically: boolean; reason?: string | null };

/** Who the step is waiting on, as BTG's desk names them. */
const DESK_WHO: Record<NextStepWho, string> = {
  BTG: "BTG",
  SYSTEM: "Automatic",
  ATHLETES: "Athletes",
  SPONSOR: "Sponsor",
};

/** Badge tone for who the step waits on — BTG's own move stands out. */
export function nextStepTone(who: NextStepWho): "warn" | "accent" | "primary" | "neutral" {
  if (who === "BTG") return "warn";
  if (who === "SYSTEM") return "accent";
  if (who === "ATHLETES") return "primary";
  return "neutral";
}

/** The desk's short label for who the step waits on. */
export function nextStepWho(step: NextStep): string {
  return DESK_WHO[step.who];
}

/** The sponsor's line: the API's plain words, or nothing at all. Never a
 *  state name, never "BTG to send…". */
export function sponsorNextStep(step: NextStep | null | undefined): string | null {
  const text = step?.text?.trim();
  return text ? text : null;
}

const stateWord = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** One line of stage history: "Moved to Approval automatically · Oct 3". */
export function stageChangeLine(change: StageChange, timeZone = "UTC"): string {
  const when = new Date(change.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  return `${change.movedAutomatically ? "Moved automatically" : "Moved by BTG"} to ${stateWord(change.state)} · ${when}`;
}

/* --------------------------------------------------------------------------
   P4-FE-09 — campaigns staff themselves (P4-BE-12), then launch on their
   start date (P4-BE-13). The campaign reads carry `staffing` (counted by
   athlete; BTG's staff get every count and the stop, a sponsor only how
   many signed against the package's range) and, for BTG, `autoStaffing`.
   -------------------------------------------------------------------------- */

export type StaffingStop = { reason: string; at: string };
export type StaffingSkip = { athleteId: string; displayName: string | null; reason: string; at: string };
/** POL-BE-22 — set while a campaign, before launch (DRAFT or STAFFING) and
 *  short of its minimum, waits on BTG. The API never says why; `since` is
 *  when the wait began. */
export type StaffingWait = { since: string };
/** BTG's staffing read. */
export type CampaignStaffing = {
  sent: number;
  signed: number;
  outstanding: number;
  declined: number;
  expired: number;
  skipped: number;
  needed: { min: number; max: number };
  stop: StaffingStop | null;
  skips?: StaffingSkip[];
  /** POL-BE-22 — BTG's own word for the wait. */
  stalled?: StaffingWait | null;
  btgFinding?: StaffingWait | null;
};
/** The sponsor's staffing read. */
export type SponsorStaffing = {
  signed: number;
  needed: { min: number; max: number };
  /** POL-BE-22 — the sponsor's word for the wait: BTG is finding more athletes. */
  btgFinding?: StaffingWait | null;
};

/** The stop on a campaign's staffing, or null — the board's "Staffing stopped" badge. */
export function staffingStop(s: CampaignStaffing | SponsorStaffing | null | undefined): StaffingStop | null {
  return s && "stop" in s && s.stop ? s.stop : null;
}

/** "5–9", or "3" when the package takes exactly that many. */
export function rangeWords(needed: { min: number; max: number }): string {
  return needed.min === needed.max ? `${needed.max}` : `${needed.min}–${needed.max}`;
}

/** BTG's staffing panel, in the order it reads: sent, signed, waiting, declined — and the rest when there are any. */
export function staffingTiles(s: CampaignStaffing): Array<{ label: string; value: number }> {
  const tiles = [
    { label: "Sent", value: s.sent },
    { label: "Signed", value: s.signed },
    { label: "Waiting", value: s.outstanding },
    { label: "Declined", value: s.declined },
  ];
  if (s.expired) tiles.push({ label: "Ran out", value: s.expired });
  if (s.skipped) tiles.push({ label: "Skipped", value: s.skipped });
  return tiles;
}

/** "We're staffing your campaign: 4 of 5–9 athletes signed", the bare count
 *  ("4 of 5–9 athletes signed") and how full the package is (0–100, against its maximum). */
export function sponsorStaffing(s: SponsorStaffing | CampaignStaffing | null | undefined): { line: string; count: string; pct: number } | null {
  if (!s || s.needed.max <= 0) return null;
  const count = `${s.signed} of ${rangeWords(s.needed)} athletes signed`;
  return {
    line: `We're staffing your campaign: ${count}`,
    count,
    pct: Math.min(100, Math.round((100 * s.signed) / s.needed.max)),
  };
}

/* --------------------------------------------------------------------------
   POL-FE-22 — a sponsor is told when staffing stalls (POL-BE-22). The
   sponsor's `staffing.btgFinding` carries only when the wait began; these
   lines say BTG is on it without inventing a reason.
   -------------------------------------------------------------------------- */

/** The day BTG stepped in, "Oct 28" — or null when the API sent no wait, or a date it can't place. */
export function btgFindingDay(s: SponsorStaffing | CampaignStaffing | null | undefined, timeZone = "UTC"): string | null {
  const since = s?.btgFinding?.since;
  if (!since) return null;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

/** "BTG is finding more athletes · since Oct 28", or null when BTG isn't. */
export function btgFindingLine(s: SponsorStaffing | CampaignStaffing | null | undefined, timeZone = "UTC"): string | null {
  const day = btgFindingDay(s, timeZone);
  return day ? `BTG is finding more athletes · since ${day}` : null;
}

/** Whether a headline (the API's own next step, say) already tells the
 *  sponsor BTG is finding athletes — so the screen doesn't print it twice. */
export function saysBtgFinding(text: string | null | undefined): boolean {
  return /^\s*BTG is finding\b/i.test(text ?? "");
}

/** Whether the staffing count belongs on screen: while the campaign is being
 *  staffed, or earlier, as a draft, once BTG is finding athletes for it. */
export function showsStaffing(state: string, s: SponsorStaffing | CampaignStaffing | null | undefined): boolean {
  return state === "STAFFING" || (state === "DRAFT" && !!s?.btgFinding);
}

/** "Launches on Oct 10" — from 00:00 UTC on the start date; "Launches in the next few minutes" once that has come. */
export function launchLine(startDate: string, now: Date): string {
  const d = new Date(startDate);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (day <= now.getTime()) return "Launches in the next few minutes";
  return `Launches on ${new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** Why the automatic-staffing reason can't be sent yet, or null. The API takes 1–500 characters. */
export function autoStaffingReasonProblem(reason: string): string | null {
  const text = reason.trim();
  if (!text) return "Write a reason — it goes on the campaign's record.";
  if (text.length > 500) return "Keep the reason to 500 characters.";
  return null;
}

/* --------------------------------------------------------------------------
   POL-FE-51 — "Launch now". A campaign goes live by itself at 00:00 UTC on
   its start date (P4-BE-13); BTG may launch it sooner through POST
   /campaigns/{id}/launch (P5-BE-04), which until now no screen called.

   The API's rules, mirrored here only to decide what to SHOW (the API stays
   the gate): only APPROVAL may become ACTIVE (campaign-state.ts — STAFFING
   cannot skip approval), and only BTG launches — tenant-wide
   `campaign.approve`, i.e. BTG admins and campaign managers, and
   SUPER_ADMIN (campaign.ts launchCampaign). A sponsor admin's `own` approve
   is refused by the domain, so it is not offered here either.
   -------------------------------------------------------------------------- */

export const LAUNCH_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"] as const;

/** May this viewer launch this campaign now? */
export function mayLaunchNow(state: string, roles: readonly string[]): boolean {
  return state === "APPROVAL" && roles.some((r) => (LAUNCH_ROLES as readonly string[]).includes(r));
}

/** POST /campaigns/{id}/launch's answer (domain/campaign.ts launchIn). */
export type LaunchResult = {
  id: string;
  state: string;
  ordersActivated: number;
  rewards?: { activated: number; leftInDraft: Array<{ id: string; offerText: string; reason: string }> };
};

/** What BTG reads after launching: what went live, and any reward left behind. */
export function launchedLines(r: LaunchResult): string[] {
  const n = r.ordersActivated;
  const lines = [
    `Launched. The campaign is live from today${n ? ` and ${n} signed order${n === 1 ? " is" : "s are"} now live work` : ""}. The sponsor can see results.`,
  ];
  const activated = r.rewards?.activated ?? 0;
  if (activated) lines.push(`${activated} fan reward${activated === 1 ? " is" : "s are"} live too.`);
  for (const d of r.rewards?.leftInDraft ?? []) {
    lines.push(`A reward stayed a draft: “${d.offerText}” — ${d.reason}`);
  }
  return lines;
}

/** The API's refusal of a launch, in words. */
export function launchRefusal(status: number, body: unknown): string {
  const said = (body as { error?: { message?: string } } | null)?.error?.message ?? "";
  if (status === 403) return "Only BTG admins and campaign managers can launch a campaign, so it wasn't launched.";
  if (status === 401) return "Your session has ended. Sign in again, then launch it once more.";
  if (status === 409 && /cannot go from (\w+) to ACTIVE/.test(said)) {
    const from = said.match(/cannot go from (\w+) to ACTIVE/)![1];
    if (from === "ACTIVE") return "It's already live — nothing to launch. Reload the page to see it.";
    return `It wasn't launched: the campaign is ${from.toLowerCase()} now, and only a campaign waiting for approval can be launched. Reload the page to see where it is.`;
  }
  if (status === 409) return "Someone else moved this campaign just now, so it wasn't launched. Reload the page to see where it is.";
  if (status >= 500) return "Something went wrong on our side, so the campaign wasn't launched. Try again in a minute.";
  return said ? `It wasn't launched: ${said}` : `It wasn't launched (HTTP ${status}).`;
}

/* --------------------------------------------------------------------------
   POL-FE-52 (app review B1) — moving a campaign between DRAFT, STAFFING and
   APPROVAL by hand. Automatic staffing stops below the package minimum and
   the automatic STAFFING → APPROVAL move needs the maximum, so a partly
   staffed campaign never reached APPROVAL (where "Launch now" lives). These
   buttons call the existing POST /campaigns/{id}/transition. The API stays
   the gate (campaign-state.ts and campaign.write); this only decides what
   to show, to BTG's launch roles.
   -------------------------------------------------------------------------- */

export type StageMove = { to: "STAFFING" | "APPROVAL" | "DRAFT"; label: string; hint: string; primary: boolean };

/** The hand moves BTG is offered from this state. */
export function stageMoves(state: string, roles: readonly string[]): StageMove[] {
  if (!roles.some((r) => (LAUNCH_ROLES as readonly string[]).includes(r))) return [];
  if (state === "DRAFT") {
    return [{ to: "STAFFING", label: "Start staffing", hint: "Opens the campaign to invitations and offers.", primary: true }];
  }
  if (state === "STAFFING") {
    return [
      { to: "APPROVAL", label: "Move to approval", hint: "Staffing is done — the campaign waits to launch.", primary: true },
      { to: "DRAFT", label: "Back to draft", hint: "The brief needs changing before anyone is staffed.", primary: false },
    ];
  }
  if (state === "APPROVAL") {
    return [{ to: "STAFFING", label: "Back to staffing", hint: "More athletes are needed before launch.", primary: false }];
  }
  return [];
}

/** What BTG reads after a move. */
export function stageMovedLine(to: StageMove["to"]): string {
  if (to === "STAFFING") return "Moved to staffing.";
  if (to === "APPROVAL") return "Moved to approval — it launches on its start date, or use Launch now.";
  return "Moved back to draft.";
}

/** The API's refusal of a move, in words. */
export function stageMoveRefusal(status: number, body: unknown): string {
  const said = (body as { error?: { message?: string } } | null)?.error?.message;
  if (typeof said === "string" && said) return said;
  if (status === 403) return "Your role can't move this campaign.";
  if (status === 409) return "The campaign moved on meanwhile — reload the page.";
  return `SponsorX couldn't move the campaign (HTTP ${status}). Nothing changed.`;
}
