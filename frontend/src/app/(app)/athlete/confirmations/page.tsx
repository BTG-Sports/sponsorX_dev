import Link from "next/link";

import { ArenaHead, ArenaLink, ArenaUpdated } from "@/components/arena-stage";
import { ConfirmationsWizard, type WizardStep, type WizardWords } from "@/components/confirmations-wizard";
import {
  cardMode,
  confirmedLine,
  guardianDoesLine,
  readMinutes,
  requiredLine,
  stepState,
  tickLine,
  viewerOf,
  type Viewer,
} from "@/lib/athlete-confirmations";
import { COLLAB_WORDS, RULES_WORDS, returnPath, type ApiMyCollab, type ApiMyRules } from "@/lib/confirmations-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "./confirmations.css";

/* --------------------------------------------------------------------------
   Confirmations — P8-FE-04 / P8-FE-07, the athlete portal. The two things
   an athlete confirms before a new deal:

     Your own rules                    GET /me/rules-attestation   (P8-BE-02)
     Content Collaboration Agreement   GET /me/collab-agreement    (P8-BE-04)

   Redesigned 2026-11-16 as a step-by-step wizard (components/
   confirmations-wizard.tsx; owner: the two stacked cards were "so
   confusing for a human"): a numbered stepper as the overview, one step
   each — read it, tick the box, confirm — then "all set" and the way back. This server page reads
   both standings and decides every word; the wizard only walks them.

   Seats, unchanged: a minor's own login reads that the guardian confirms
   from their own login (no tick box); a guardian acting for the minor
   confirms in the minor's name. `?return=` is where a refused accept sent
   the athlete from — the way back, same-site paths only. A read this login
   may not have (a guardian with no ward picked gets 403) leaves that step
   unavailable rather than failing the page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function standing<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const COUNT = ["No", "One", "Two"];

function words(viewer: Viewer, steps: WizardStep[], back: string): WizardWords {
  const todo = steps.filter((s) => s.state === "todo").length;
  const guardianOnly = todo === 0 && steps.some((s) => s.state === "guardian");
  const ward = viewer.actingForWard ? viewer.wardName : null;
  const things = todo === 1 ? "one thing" : `${(COUNT[todo] ?? String(todo)).toLowerCase()} things`;
  const heading = guardianOnly
    ? "Your guardian handles these"
    : todo === 0
      ? "Almost there"
      : `${COUNT[todo] ?? todo} quick ${todo === 1 ? "step" : "steps"} ${ward ? `for ${ward}` : "before your next deal"}`;
  const sub = guardianOnly
    ? `${viewer.guardianName} confirms these from their own login. You can open each step to read what they agree to.`
    : todo === 0
      ? "Part of this can't be loaded right now. Open the step to try again."
      : ward
        ? `Before ${ward} can take a new deal, you agree to ${things} for them. Read it, tick the box, press confirm — that's it.`
        : `Before you take a new deal, you agree to ${things}. Read it, tick the box, press confirm — that's it.`;
  return {
    eyebrow: ward ? `Confirming for ${ward}` : "Before your next deal",
    heading,
    sub,
    guardianOnly,
    doneHeading: ward ? `${ward} is all set` : "You're all set",
    doneSub: ward
      ? "Both are confirmed and saved. They won't hold up a new deal for them."
      : "Both are confirmed and saved. They won't hold up your next deal.",
    back,
    backLabel: back === "/athlete" ? "Go to your dashboard" : "Pick up where you left off",
    recordNote: RULES_WORDS.recordNote,
  };
}

export default async function ConfirmationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("athlete");
  const sp = await searchParams;
  const back = returnPath(sp.return);
  const viewer = viewerOf(actor);
  const [rules, collab] = await Promise.all([standing<ApiMyRules>("/me/rules-attestation"), standing<ApiMyCollab>("/me/collab-agreement")]);
  const guardianWithoutWard = !rules && !collab && actor.roles.includes("GUARDIAN") && !actor.roles.includes("ATHLETE") && !viewer.actingForWard;
  const theirs = viewer.actingForWard ? `${viewer.wardName}'s` : "Your";

  const steps: WizardStep[] = [
    {
      kind: "rules",
      state: stepState(cardMode(rules, viewer)),
      title: RULES_WORDS.title,
      short: "Your rules",
      tagline: `${theirs} school, league and state may have rules about paid sponsorships. Confirm ${viewer.actingForWard ? "they've" : "you've"} checked them and will follow them.`,
      why: rules ? requiredLine(rules, viewer) : null,
      version: rules ? `Wording ${rules.version}` : "",
      minutes: rules ? readMinutes(rules.text) : 1,
      text: rules?.text ?? "",
      tick: rules ? tickLine("rules", rules.version, viewer) : "",
      cta: "Confirm",
      record: rules ? confirmedLine(rules.attestedAt, rules.version, "rules") : "",
      guardianLine: guardianDoesLine(viewer, Boolean(rules?.required)),
      target: { kind: "rules", version: rules?.version ?? "" },
    },
    {
      kind: "collab",
      state: stepState(cardMode(collab, viewer)),
      title: COLLAB_WORDS.title,
      short: "Agreement",
      tagline:
        "How deals on SponsorX work — Campaign Orders, pay, who owns the content, and what happens if there's a concern. You accept it once; every deal still comes with its own Campaign Order.",
      why: collab ? requiredLine(collab, viewer) : null,
      version: collab ? `Version ${collab.version}` : "",
      minutes: collab ? readMinutes(collab.body) : 1,
      text: collab?.body ?? "",
      tick: collab ? tickLine("collab", collab.version, viewer) : "",
      cta: "Accept agreement",
      record: collab ? confirmedLine(collab.acceptedAt, collab.version, "collab") : "",
      guardianLine: guardianDoesLine(viewer, Boolean(collab?.required)),
      target: { kind: "collab", agreementId: collab?.agreementId ?? "", bodyHash: collab?.bodyHash ?? "" },
    },
  ];

  return (
    <div className="space-y-6">
      <ArenaHead title="Confirmations" pill={<ArenaUpdated />} actions={<ArenaLink href={back}>Back to where you were</ArenaLink>} />

      {guardianWithoutWard ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          You&rsquo;re signed in as a guardian and aren&rsquo;t acting for an athlete right now. Pick the athlete from your{" "}
          <Link href="/athlete" className="font-semibold text-athlete underline underline-offset-2">dashboard</Link> first.
        </p>
      ) : (
        <ConfirmationsWizard steps={steps} words={words(viewer, steps, back)} />
      )}
    </div>
  );
}
