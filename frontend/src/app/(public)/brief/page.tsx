import { packageOption } from "@/lib/brief-flow";
import { BriefWizard } from "@/components/brief-wizard";

/* --------------------------------------------------------------------------
   Sponsor brief request — the public half of B3 (§13). Phase 1 is managed:
   this collects goal, budget band, market and contact; BTG matches, checks
   conflicts and prices the proposal. No card, no checkout, nothing signed.

   Same split-stage frame as /join: sticky brand panel at lg+, the 430px
   wizard card beside it, phone-first below. ?package=<id> prefills the
   starting package (unknown ids fall back to "Not sure yet");
   ?demo=submitted lands on the received state.
   -------------------------------------------------------------------------- */

const TRUST = [
  {
    title: "No card, no checkout",
    body: "You are requesting a proposal, not buying one. Money moves only after you approve a campaign order.",
  },
  {
    title: "Conflicts checked first",
    body: "Every athlete on your shortlist is screened against their declared restrictions before you ever see a name (§26).",
  },
  {
    title: "A person replies",
    body: "BTG staff match, price and respond — usually within 2 business days.",
  },
] as const;

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string; demo?: string }>;
}) {
  const sp = await searchParams;
  /* Only pass a package when one was actually asked for — a bare /brief
     visit must resume any stored draft, not reset it to "unsure". */
  const pkg = sp.package ? packageOption(sp.package).id : undefined;
  const demo = sp.demo === "submitted" ? ("submitted" as const) : null;

  return (
    <div className="sx-join-stage">
      <div className="mx-auto w-full max-w-6xl px-0 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-20 lg:px-8 lg:py-14">
        {/* ------------------------------------------ brand panel (lg+ only) */}
        <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
          <p className="sx-join-rise text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            BTG SponsorX · For sponsors
          </p>
          <h2
            className="sx-join-rise mt-4 max-w-md text-5xl font-semibold leading-[1.05] tracking-tight"
            style={{ "--sx-d": "0.08s" } as React.CSSProperties}
          >
            Brief BTG once — get a matched shortlist back.
          </h2>
          <p
            className="sx-join-rise mt-5 max-w-md text-base leading-relaxed text-muted"
            style={{ "--sx-d": "0.16s" } as React.CSSProperties}
          >
            Four steps, about three minutes. BTG filters eligible athletes,
            checks conflicts and prices the proposal — you react to a
            shortlist, not a search box.
          </p>

          <ul className="mt-10 max-w-md space-y-6">
            {TRUST.map((t, i) => (
              <li
                key={t.title}
                className="sx-join-rise flex gap-4"
                style={{ "--sx-d": `${0.28 + i * 0.1}s` } as React.CSSProperties}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-accent/40">
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="var(--sx-accent)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path
                      d="M2.5 6.5l2.5 2.5 4.5-5.5"
                      pathLength={1}
                      className="sx-join-draw"
                      style={{ "--sx-d": `${0.5 + i * 0.1}s` } as React.CSSProperties}
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-text">{t.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{t.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* -------------------------------------------------- wizard column */}
        <div className="mx-auto w-full max-w-[430px] lg:mx-0 lg:rounded-2xl lg:border lg:border-line lg:bg-surface/60 lg:shadow-[0_24px_80px_-32px_rgba(0,0,0,0.55)] lg:backdrop-blur">
          <BriefWizard pkg={pkg} demo={demo} />
        </div>
      </div>
    </div>
  );
}
