import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card } from "@/components/ui";
import { resolveBack } from "@/lib/back";
import { applicationSections } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door.

   Absent from mockup v1.0 entirely: the mockup starts at an already-onboarded
   athlete. §39 makes this the first step of the protected loop, so it is built
   here against §11's ten onboarding sections.

   The application funnel is DRAFT → SUBMITTED (§11). This screen collects; it
   does not submit for real. Two things stay deliberately un-wired:

   - Agreement acceptance is blocked until counsel approves the Content
     Collaboration Agreement template (guide §08 / §12) — accepting unapproved
     text would hash an unenforceable agreement.
   - The guardian section only matters for minors (§4); shown here as a
     conditional section rather than a separate flow.

   No client JS: inputs are native and uncontrolled, the submit is disabled.
   The real form is B1, behind a Zod contract (src/contracts/athlete.ts).
   -------------------------------------------------------------------------- */

function TextField({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
      />
    </div>
  );
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const back = resolveBack(from, "home");
  const total = applicationSections.length;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <BackLink target={back} />

      {/* --------------------------------------------------------- header */}
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Join the Athlete Network
          </h1>
          <Badge tone="primary">§11</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          Apply to the SponsorX athlete network. Your application is reviewed by
          the BTG Athlete Network Manager, who confirms your rate card and
          approves you into the network before any sponsor sees you.
        </p>
      </div>

      {/* ------------------------------------------------------ status bar */}
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <Badge tone="neutral">Draft</Badge>
        <span className="text-[11px] text-muted">
          Saved as you go · {total} sections · submits to review when complete
        </span>
      </div>

      {/* -------------------------------------------------------- sections */}
      <div className="mt-6 space-y-4">
        {applicationSections.map((section, i) => (
          <Card key={section.id}>
            <div className="flex items-baseline gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {section.title}
                  </h2>
                  {"minorOnly" in section && section.minorOnly && (
                    <Badge tone="warn">Minors only · §4</Badge>
                  )}
                  {"blocked" in section && section.blocked && (
                    <Badge tone="warn">Blocked · §08</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
                  {section.blurb}
                </p>
              </div>
            </div>

            {section.fields.length > 0 && (
              <div className="mt-4 grid gap-4 pl-9 sm:grid-cols-2">
                {section.fields.map((f) => (
                  <TextField
                    key={f.label}
                    label={f.label}
                    placeholder={f.placeholder}
                  />
                ))}
              </div>
            )}

            {"blocked" in section && section.blocked && (
              <div className="mt-4 pl-9">
                <BlockedNotice>
                  The Content Collaboration Agreement cannot be accepted until
                  counsel approves the template (guide §08). This section stores
                  a hash of the rendered agreement body at acceptance — so it
                  must show approved text first. Wiring lands in B1.
                </BlockedNotice>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* ---------------------------------------------------------- submit */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          title="Blocked: submission needs the Zod contract and the counsel-approved agreement (B1). UI only."
          className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit application
        </button>
        <button
          type="button"
          title="Draft autosave — not wired"
          className="rounded-lg border border-line px-5 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
        >
          Save draft
        </button>
        <Link
          href="/"
          className="text-[11px] text-muted transition-colors hover:text-text"
        >
          Cancel
        </Link>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-[10px] leading-relaxed text-faint">
        Guardian authorization for minors and true e-signature are open A-gate
        decisions (Roadmap A-gates). SponsorX collects no bank details and no
        tax ID at any point (§26, Addendum A6).
      </p>
    </div>
  );
}
