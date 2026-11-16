import { MIN_DESCRIPTION, stamp, type ApiAthleteListing, type ListCheck } from "./athlete-listings-live";
import { fmtDay } from "./inventory-live";

/* --------------------------------------------------------------------------
   POL-FE-85 — one of the athlete's listings (/athlete/listings/[id]),
   redrawn. The programme owner: "more professional look + wow factor …
   easy to understand by human + not too cluttered + not to many
   informations at once", then "maybe a step by step wizard too?".

   So the page has two faces, worked out here (pure, server-side words):

   - a DRAFT of their own is a three-step wizard — 1 the item, 2 what the
     sponsor gets, 3 go live — one question per step, a sponsor's-eye card
     beside it that follows the typing, and the checks only on the last
     step, where they decide anything;
   - every other listing is a status view: one sentence on where it stands,
     a three-stop journey (Written → Checked → Live), what the sponsor
     reads, and the one control that state allows.
   -------------------------------------------------------------------------- */

export type WizardStep = 1 | 2 | 3;

/** The checklist rows that belong to the item (fixed in Inventory, step 1). */
const ITEM_KEYS = new Set(["title", "price", "available"]);

export function itemChecks(checks: readonly ListCheck[]): ListCheck[] {
  return checks.filter((c) => ITEM_KEYS.has(c.key));
}

/** Where the wizard opens: on the first step with something to fix, else on "go live". */
export function wizardStart(checks: readonly ListCheck[], description: string): WizardStep {
  if (itemChecks(checks).some((c) => c.status === "fix")) return 1;
  if (description.trim().length < MIN_DESCRIPTION) return 2;
  return 3;
}

export type CheckSummary = {
  /** Required rows that pass, of how many. */
  ready: number;
  total: number;
  fix: ListCheck[];
  optional: ListCheck[];
};

/** "6 of 7 ready", the rows to fix, and the optional ones — never the whole list at once. */
export function checkSummary(checks: readonly ListCheck[]): CheckSummary {
  const required = checks.filter((c) => c.status !== "optional");
  return {
    ready: required.filter((c) => c.status === "ready").length,
    total: required.length,
    fix: required.filter((c) => c.status === "fix"),
    optional: checks.filter((c) => c.status === "optional"),
  };
}

/** The textarea's meter: 0..1 toward the minimum, and the words under it. */
export function writingMeter(text: string): { n: number; share: number; label: string; ok: boolean } {
  const n = text.trim().length;
  const ok = n >= MIN_DESCRIPTION;
  return {
    n,
    share: Math.min(1, n / MIN_DESCRIPTION),
    ok,
    label: ok ? "Enough to go live. More detail sells better." : `${MIN_DESCRIPTION - n} more ${MIN_DESCRIPTION - n === 1 ? "character" : "characters"} to go`,
  };
}

/* ── the status view ───────────────────────────────────────────────────── */

export type StopState = "done" | "now" | "todo" | "paused" | "ended";
export type JourneyStop = { key: "written" | "checked" | "live"; label: string; note: string; state: StopState };

/** Written → Checked → Live, with the listing's own dates. */
export function journey(l: ApiAthleteListing, now: number): JourneyStop[] {
  const submitted = l.submittedAt ? fmtDay(l.submittedAt) : "";
  const live = l.publishedAt ? `Since ${fmtDay(l.publishedAt)}` : "";
  const written: JourneyStop = { key: "written", label: "Written", note: submitted ? `Submitted ${submitted}` : "", state: "done" };
  switch (l.state) {
    case "DRAFT":
      return [
        { ...written, note: "In progress", state: "now" },
        { key: "checked", label: "Checked", note: "", state: "todo" },
        { key: "live", label: "Live", note: "", state: "todo" },
      ];
    case "PENDING_APPROVAL":
      return [written, { key: "checked", label: "Checked", note: "BTG is taking a look", state: "now" }, { key: "live", label: "Live", note: "", state: "todo" }];
    case "PUBLISHED": {
      const soon = Boolean(l.publishAt && new Date(l.publishAt).getTime() > now);
      return [
        written,
        { key: "checked", label: "Checked", note: "Passed", state: "done" },
        soon ? { key: "live", label: "Goes live", note: fmtDay(l.publishAt!), state: "now" } : { key: "live", label: "Live", note: live, state: "now" },
      ];
    }
    case "PAUSED":
      return [written, { key: "checked", label: "Checked", note: "Passed", state: "done" }, { key: "live", label: "Paused", note: "Hidden from sponsors", state: "paused" }];
    case "ARCHIVED":
      return [written, { key: "checked", label: "Checked", note: "", state: "done" }, { key: "live", label: "Ended", note: "Off the marketplace", state: "ended" }];
  }
}

/** The controls a state allows — one main one, at most. */
export type DeskControls = {
  /** Live ↔ Paused (published or paused). */
  liveSwitch: boolean;
  /** "Edit what the sponsor gets" in a popup (paused, or held for BTG). */
  edit: "resume" | "resubmit" | null;
  /** "End listing", tucked away at the foot. */
  end: boolean;
};

export function deskControls(l: Pick<ApiAthleteListing, "state" | "seller">): DeskControls {
  if (l.seller.type !== "ATHLETE") return { liveSwitch: false, edit: null, end: false };
  return {
    liveSwitch: l.state === "PUBLISHED" || l.state === "PAUSED",
    edit: l.state === "PAUSED" ? "resume" : l.state === "PENDING_APPROVAL" ? "resubmit" : null,
    end: l.state !== "ARCHIVED",
  };
}

/** "Last change Nov 12, 3:02 pm UTC" — the one date the status view keeps. */
export function lastChange(l: Pick<ApiAthleteListing, "updatedAt">): string {
  return `Last change ${stamp(l.updatedAt)}`;
}
