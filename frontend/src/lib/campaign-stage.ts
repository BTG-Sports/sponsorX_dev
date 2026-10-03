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
