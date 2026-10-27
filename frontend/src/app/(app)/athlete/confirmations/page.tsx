import Link from "next/link";
import type { ReactNode } from "react";

import { ArenaChip, ArenaHead, ArenaUpdated, ArenaLink, ArenaPanel, ArenaSection } from "@/components/arena-stage";
import { ConfirmationsForm, type ConfirmationTarget } from "@/components/confirmations-form";
import {
  cardMode,
  confirmedLine,
  guardianDoesLine,
  requiredLine,
  tickLine,
  viewerOf,
  type CardMode,
  type Viewer,
} from "@/lib/athlete-confirmations";
import { COLLAB_WORDS, RULES_WORDS, returnPath, type ApiMyCollab, type ApiMyRules } from "@/lib/confirmations-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Confirmations — P8-FE-04 / P8-FE-07, the athlete portal. The two things
   an athlete confirms before a new deal, on one page, each a card:

     Your own rules                    GET /me/rules-attestation   (P8-BE-02)
     Content Collaboration Agreement   GET /me/collab-agreement    (P8-BE-04)

   A current card is one quiet line. An outstanding one shows the wording
   verbatim, the tick line and Confirm (components/confirmations-form.tsx →
   ./actions.ts). A minor's own login sees that the guardian confirms from
   their own login; a guardian acting for the minor confirms in the minor's
   name. `?return=` is where a refused accept sent the athlete from (the
   order page, Track C) — the way back, same-site paths only.

   A read this login may not have (a guardian with no ward picked gets 403)
   leaves that card unavailable rather than failing the page.
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

function Card({ title, mode, delay, hint, children }: { title: string; mode: CardMode; delay: number; hint?: string; children: ReactNode }) {
  const chip =
    mode === "confirmed" ? <ArenaChip tone="win">Confirmed</ArenaChip>
    : mode === "ask" ? <ArenaChip tone="warn">To confirm</ArenaChip>
    : mode === "guardianDoes" ? <ArenaChip tone="blue">Your guardian</ArenaChip>
    : <ArenaChip tone="ink">Unavailable</ArenaChip>;
  return (
    <section>
      <ArenaSection title={title} hint={hint} action={chip} delay={delay} />
      <ArenaPanel tone={mode === "ask" ? "warn" : mode === "confirmed" ? "win" : "blue"} delay={delay + 0.05} spot>
        {children}
      </ArenaPanel>
    </section>
  );
}

/** The wording, verbatim — the agreement's hash is of exactly this text. */
function Wording({ label, text }: { label: string; text: string }) {
  return (
    <pre tabIndex={0} aria-label={label} className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface/60 px-4 py-3 font-sans text-xs leading-relaxed text-muted">
      {text}
    </pre>
  );
}

function Standing({
  mode, confirmed, required, enforced, viewer, wording, target, line,
}: {
  mode: CardMode;
  confirmed: string;
  required: string | null;
  /** BTG's switch is on for this one (the guardian line says a deal waits even when the athlete's own line is hidden). */
  enforced: boolean;
  viewer: Viewer;
  wording: ReactNode;
  target: ConfirmationTarget;
  line: string;
}) {
  if (mode === "unavailable") {
    return <p className="text-sm text-muted">This can&rsquo;t be loaded right now. Try again in a moment.</p>;
  }
  if (mode === "confirmed") {
    return <p className="text-sm text-success">{confirmed}</p>;
  }
  return (
    <div className="space-y-4">
      {required && <p className="text-sm font-semibold text-warn">{required}</p>}
      {wording}
      {mode === "guardianDoes" ? (
        <p className="text-sm leading-relaxed">{guardianDoesLine(viewer, enforced)}</p>
      ) : (
        <>
          <ConfirmationsForm target={target} line={line} cta={target.kind === "rules" ? "Confirm" : "Accept"} />
          <p className="text-[11px] leading-relaxed text-faint">{RULES_WORDS.recordNote}</p>
        </>
      )}
    </div>
  );
}

export default async function ConfirmationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("athlete");
  const sp = await searchParams;
  const back = returnPath(sp.return);
  const viewer = viewerOf(actor);
  const [rules, collab] = await Promise.all([standing<ApiMyRules>("/me/rules-attestation"), standing<ApiMyCollab>("/me/collab-agreement")]);
  const rulesMode = cardMode(rules, viewer);
  const collabMode = cardMode(collab, viewer);
  const allDone = rulesMode === "confirmed" && collabMode === "confirmed";
  const guardianWithoutWard = !rules && !collab && actor.roles.includes("GUARDIAN") && !actor.roles.includes("ATHLETE") && !viewer.actingForWard;

  return (
    <div className="space-y-8">
      <ArenaHead
        title="Confirmations"
        pill={<ArenaUpdated />}
        lede={
          viewer.actingForWard
            ? `What ${viewer.wardName} needs confirmed before a new deal. You confirm it for them.`
            : "The two things you confirm before a new deal. Each one is recorded with its wording version and the date."
        }
        actions={allDone ? <Link href={back} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-xs font-bold text-cta-ink hover:bg-primary-soft">Back to where you were</Link> : <ArenaLink href={back}>Back to where you were</ArenaLink>}
      />

      {guardianWithoutWard && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          You&rsquo;re signed in as a guardian and aren&rsquo;t acting for an athlete right now. Pick the athlete from your{" "}
          <Link href="/athlete" className="font-semibold text-athlete underline underline-offset-2">dashboard</Link> first.
        </p>
      )}

      <Card title={RULES_WORDS.title} mode={rulesMode} delay={0.1} hint={rules ? `Wording ${rules.version}` : undefined}>
        <Standing
          mode={rulesMode}
          confirmed={rules ? confirmedLine(rules.attestedAt, rules.version, "rules") : ""}
          required={rules ? requiredLine(rules, viewer) : null}
          enforced={Boolean(rules?.required)}
          viewer={viewer}
          wording={rules ? <Wording label="Your own rules wording" text={rules.text} /> : null}
          target={{ kind: "rules", version: rules?.version ?? "" }}
          line={rules ? tickLine("rules", rules.version, viewer) : ""}
        />
      </Card>

      <Card title={COLLAB_WORDS.title} mode={collabMode} delay={0.2} hint={collab ? `Version ${collab.version}` : undefined}>
        <Standing
          mode={collabMode}
          confirmed={collab ? confirmedLine(collab.acceptedAt, collab.version, "collab") : ""}
          required={collab ? requiredLine(collab, viewer) : null}
          enforced={Boolean(collab?.required)}
          viewer={viewer}
          wording={collab ? <Wording label="Content Collaboration Agreement text" text={collab.body} /> : null}
          target={{ kind: "collab", agreementId: collab?.agreementId ?? "", bodyHash: collab?.bodyHash ?? "" }}
          line={collab ? tickLine("collab", collab.version, viewer) : ""}
        />
      </Card>
    </div>
  );
}
