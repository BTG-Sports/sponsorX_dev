import { NEVER_ASKED } from "@/lib/join-flow";
import { JoinWizard } from "@/components/join-wizard";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door. P1-ART-07 built in-app:
   the phone-first progressive wizard (one section per screen, the §4 guardian
   branch, localStorage drafts, v0.4 click-wrap, after-submit state).

   Desktop (lg+) is a split stage: a sticky brand panel beside the wizard
   column, so the 430px flow reads as designed-for rather than a mobile site
   on a big screen. The form column never widens — long input rows hurt
   completion. Below lg the panel disappears and the phone-first view is
   exactly the P1-ART-07 comps.

   Wired (P3-FE-01): submit POSTs the real application through the server
   action in ./actions.ts. Demo modes stay simulation — ?demo=minor lands on
   section 1 with an under-18 DOB, ?demo=submitted on the after-submit state
   with the guardian card, and neither ever reaches the API.
   -------------------------------------------------------------------------- */

const TRUST = [
  {
    title: "Reviewed by hand",
    body: "A person at BTG reads every application — usually within 3 business days.",
  },
  {
    title: "Nothing sensitive is collected",
    body: NEVER_ASKED,
  },
  {
    title: "Leave and come back",
    body: "Progress is saved after every section. The whole thing takes about 8 minutes.",
  },
] as const;

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const d = demo === "submitted" ? "submitted" : demo === "minor" ? "minor" : null;

  return (
    <div className="sx-join-stage">
      <div className="mx-auto w-full max-w-6xl px-0 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-20 lg:px-8 lg:py-14">
        {/* ------------------------------------------ brand panel (lg+ only) */}
        <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
          <p className="sx-join-rise text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            BTG SponsorX · Athlete Network
          </p>
          <h2
            className="sx-join-rise mt-4 max-w-md text-5xl font-semibold leading-[1.05] tracking-tight"
            style={{ "--sx-d": "0.08s" } as React.CSSProperties}
          >
            Everything in SponsorX starts with this application.
          </h2>
          <p
            className="sx-join-rise mt-5 max-w-md text-base leading-relaxed text-muted"
            style={{ "--sx-d": "0.16s" } as React.CSSProperties}
          >
            Sponsors, campaigns, rewards and earnings all begin with an athlete
            joining the network. Ten sections, one branch, no surprises.
          </p>

          <ul className="mt-10 max-w-md space-y-6">
            {TRUST.map((t, i) => (
              <li
                key={t.title}
                className="sx-join-rise flex gap-4"
                style={{ "--sx-d": `${0.28 + i * 0.1}s` } as React.CSSProperties}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-success/40">
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="var(--sx-success)"
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
          <JoinWizard demo={d} />
        </div>
      </div>
    </div>
  );
}
