import Link from "next/link";

import { confirmationsHref, outstanding, outstandingWords, type ApiMyCollab, type ApiMyRules } from "@/lib/confirmations-live";

/* --------------------------------------------------------------------------
   ConfirmationsBanner — the athlete home's "something to confirm" line
   (P8-FE-04 / P8-FE-07), drawn like the coming-of-age reminder: a warn
   banner with the title, one sentence and the way there. A minor's own
   login reads that the guardian does it and gets no link — the page would
   only say the same again. Nothing outstanding: nothing drawn.

   Server component. Takes GET /me/rules-attestation and
   GET /me/collab-agreement as the home read them (null when a read failed).
   -------------------------------------------------------------------------- */

export function ConfirmationsBanner({
  rules,
  collab,
  viewerIsGuardian,
  returnTo = "/athlete",
}: {
  rules: Pick<ApiMyRules, "current" | "required" | "byGuardian"> | null;
  collab: Pick<ApiMyCollab, "current" | "required" | "byGuardian"> | null;
  /** The viewer is a guardian acting for the athlete (actor.actingFor). */
  viewerIsGuardian: boolean;
  returnTo?: string;
}) {
  const items = outstanding(rules, collab);
  const words = outstandingWords(items, viewerIsGuardian);
  if (!words) return null;
  const minorsOwnLogin = items.some((i) => i.byGuardian) && !viewerIsGuardian;
  return (
    <section role="alert" aria-label="Confirmations" className="flex flex-wrap items-center gap-3.5 rounded-xl border border-warn/50 bg-warn/8 px-4.5 py-4">
      <span className="min-w-0 grow basis-60">
        <strong className="block text-sm text-warn">{words.title}</strong>
        <span className="mt-1 block text-sm leading-relaxed">{words.text}</span>
      </span>
      {!minorsOwnLogin && (
        <Link href={confirmationsHref(returnTo)} className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
          Confirm now
        </Link>
      )}
    </section>
  );
}
