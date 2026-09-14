import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui";
import { rewardDraft, rewardSteps } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   QR / Reward Creator — §9 screen 10, mockup screen 10.

   Form left, live fan-facing preview right, exactly as drawn. §16 adds the
   parts the mockup implies but does not show: the token is opaque and never
   the record id, single-use is enforced by a partial unique index rather than
   an application check, and scan / landing / claim / redeem are four separate
   events.

   Sweepstakes-style rewards need legal approval first (§16), so that option
   is present but disabled.
   -------------------------------------------------------------------------- */

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={[
              "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
              i === current ? "bg-primary text-cta-ink" : "bg-surface-2 text-faint",
            ].join(" ")}
          >
            {i + 1}
          </span>
          <span
            className={[
              "text-[11px] font-medium",
              i === current ? "text-text" : "text-faint",
            ].join(" ")}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-1 hidden h-px w-6 bg-line sm:block" />
          )}
        </li>
      ))}
    </ol>
  );
}

function Select({
  label,
  value,
  options,
  note,
}: {
  label: string;
  value: string;
  options: string[];
  note?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted">{label}</label>
      <div className="relative mt-1.5">
        <select
          defaultValue={value}
          className="w-full appearance-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 pr-9 text-xs text-text focus:border-primary focus:outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o} disabled={o.includes("Sweepstakes")}>
              {o}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-muted"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {note && <p className="mt-1 text-[10px] text-faint">{note}</p>}
    </div>
  );
}

/** Decorative QR stand-in. A real one is generated into R2 on save. */
function QrPlaceholder() {
  const cells = Array.from({ length: 25 }, (_, i) => (i * 7) % 3 !== 0);
  return (
    <div className="mx-auto grid size-24 grid-cols-5 gap-0.5 rounded-md bg-white p-1.5">
      {cells.map((on, i) => (
        <span
          key={i}
          className={on ? "rounded-[1px] bg-black" : "rounded-[1px] bg-white"}
        />
      ))}
    </div>
  );
}

export default function RewardCreatorPage() {
  const r = rewardDraft;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Create Fan Reward
        </h1>
        <p className="mt-1 text-xs text-muted">
          Reward, eligibility, landing page, consent, code and expiry — §16.
        </p>
      </div>

      <Card>
        <Stepper steps={rewardSteps} current={0} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* ------------------------------------------------------- form */}
        <section>
          <SectionHeading title="Reward Details" />
          <Card className="space-y-4">
            <Select
              label="Sponsor"
              value={r.sponsor}
              options={["Under Armour", "Silver Spring Grill", "Kigali Sports Co."]}
            />
            <Select
              label="Offer"
              value={r.offer}
              options={["20% Off", "$5 Off Any Meal", "Free Drink", "BOGO"]}
            />
            <Select
              label="Redemption Type"
              value={r.redemptionType}
              options={[
                "One-time use",
                "Campaign code",
                "Event check-in",
                "Lead capture",
                "Sweepstakes entry (needs legal approval)",
              ]}
              note="Single-use is enforced by a partial unique index on RewardEvent, not by an application check (guide §03)."
            />
            <Select
              label="Expiration"
              value={r.expiration}
              options={["30 Days", "60 Days", "90 Days", "End of campaign"]}
            />

            <div>
              <label className="block text-[11px] font-medium text-muted">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={3}
                placeholder="Add terms (optional)"
                className="mt-1.5 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-text placeholder:text-faint focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-faint">
                §26 requires consent and version tracking for fan marketing.
                Terms are versioned with the reward.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                title="Saves the Reward in DRAFT — not wired"
                className="rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Save Draft
              </button>
              <button
                type="button"
                title="Not wired"
                className="rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
              >
                Next: Design
              </button>
            </div>
          </Card>

          <Card className="mt-4">
            <p className="text-[11px] font-medium text-muted">
              Per-athlete attribution
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              §16 gives each athlete their own token or URL so relative
              performance is measurable. One reward, many tokens — and the
              token is opaque, never the record id.
            </p>
          </Card>
        </section>

        {/* ---------------------------------------------------- preview */}
        <section>
          <SectionHeading title="Preview" hint="What the fan sees" />
          <Card>
            <div className="rounded-xl border border-line bg-bg px-5 py-6 text-center">
              <div className="mx-auto grid size-9 place-items-center rounded-full border border-line bg-surface-2 text-[8px] font-semibold text-faint">
                UA
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">
                {r.headline}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
                {r.subhead}
              </p>

              <div className="mt-5">
                <QrPlaceholder />
              </div>
              <p className="mt-2 text-[10px] text-faint">Scan to Claim</p>

              <div className="mt-5 border-t border-line-soft pt-3">
                <p className="text-[10px] font-semibold tracking-wide text-accent">
                  {r.footer}
                </p>
                <p className="mt-0.5 text-[9px] text-faint">
                  Powered by SponsorX
                </p>
              </div>
            </div>

            <Link
              href="/r/tok123"
              className="mt-4 block rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
            >
              Open the fan redeem page →
            </Link>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              That page renders without JavaScript — it is hit on a phone, on
              venue wifi, once (guide §06).
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
