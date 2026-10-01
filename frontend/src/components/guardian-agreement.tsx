import { Badge } from "@/components/ui";
import type { GuardianAgreement } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   The guardian agreement's text — 2S1-FE-06 / 2S1-FE-10 (designs
   GuardianSetup.dc.html "agreement", GuardianHandoff.dc.html "Read the
   guardian agreement"). Placeholder wording until counsel writes the terms:
   a bracketed line is shown AS a placeholder, never as a real term, and the
   whole text carries a "draft" badge while any line is one.
   -------------------------------------------------------------------------- */

export function GuardianAgreementText({ agreement }: { agreement: GuardianAgreement }) {
  const draft = agreement.versionPending || agreement.terms.some((t) => t.placeholder);
  return (
    <div
      role="region"
      aria-label="Guardian agreement"
      tabIndex={0}
      className="max-h-56 overflow-auto rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed text-muted focus:border-primary/60 focus:outline-none"
    >
      <p className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-text">
        {agreement.title} · version {agreement.version}
        {draft && <Badge tone="warn">Draft — terms pending counsel</Badge>}
      </p>
      <ol className="space-y-2">
        {agreement.terms.map((t, i) => (
          <li key={i} className={t.placeholder ? "rounded border border-dashed border-warn/40 px-2 py-1 text-warn" : undefined}>
            {i + 1}. {t.text}
            {t.placeholder && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">· placeholder</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
