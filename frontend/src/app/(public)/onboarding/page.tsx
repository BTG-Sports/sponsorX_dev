import { OnboardingStart } from "@/components/onboarding-start";

/* --------------------------------------------------------------------------
   /onboarding — 2S1-FE-01, start. Public (no login): a team, school, event,
   media outlet or virtual venue applies to sell on the SponsorX marketplace.

   Writes POST /public/onboarding {orgType, orgName} (server action, 5 per
   hour per address) and goes to /onboarding/<resumeToken>, the application's
   own page. The token is the only key: there is no "resend my link" or
   "find my application by email" route, so the resume page says to bookmark
   it, and this device remembers it (localStorage "sx-onboarding-v1").
   -------------------------------------------------------------------------- */

export const metadata = { title: "Sell on SponsorX · Property application" };

const STEPS = ["Organisation", "Contacts", "Business details", "How you get paid", "Documents (optional)", "Property terms", "Review & submit"];

export default function OnboardingStartPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:py-14">
      <aside>
        <p className="text-[11px] uppercase tracking-[0.2em] text-faint">Property application</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">Sell on SponsorX.</h1>
        <p className="mt-3 text-sm text-muted">
          Tell BTG who you are. BTG verifies every organisation before it can list inventory on the marketplace.
        </p>
        <ol className="mt-6 hidden space-y-2 text-sm text-muted lg:block">
          {STEPS.map((r, i) => (
            <li key={r} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-full border border-line text-[11px] tabular-nums">{i + 1}</span>
              {r}
            </li>
          ))}
        </ol>
        <p className="mt-8 hidden text-[11px] text-faint lg:block">
          No bank or tax details here — those go to our payment partner, never to SponsorX.
        </p>
      </aside>
      <section className="w-full max-w-xl">
        <OnboardingStart />
      </section>
    </main>
  );
}
