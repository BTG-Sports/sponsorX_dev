import Link from "next/link";

import { FocusShell } from "@/components/focus-wizard";
import { SponsorCampaignBuilder } from "@/components/sponsor-campaign-builder";
import { isCatalogue, type BuilderCatalogue, type BuilderTargeting } from "@/lib/campaign-builder";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "@/app/brief/brief.css";
import "./builder.css";

/* --------------------------------------------------------------------------
   /sponsor/campaigns/new — Create a campaign (POL-FE-107, POL-FE-116;
   polish.md §107, §116).

   Where every "+ Create a campaign" in the sponsor portal leads: a blank
   campaign of the sponsor's own, never the package list. The page is the
   builder and nothing else, so it sits in the (focus) group, outside the
   portal's shell (sidebar and header), like the sponsor brief sits outside
   the site's. It is still a sponsor-portal page: this file makes the same
   call the portal's layout makes (requirePortalAccess), and its two ways out
   go back into the portal.

   Reads  GET /campaign-builder/catalogue   each job's medium (its fields,
                                            choices, limits and defaults),
                                            the channels, the paid media
                                            kinds and the standard terms.
          GET /catalogue/targeting          the sports, US states and
                                            countries live athletes cover.
   Writes ./actions.ts (POST /briefs with no package).

   Who: a Sponsor Admin builds a campaign. A Sponsor Viewer and a BTG preview
   are told who can, and nothing they could fill in is drawn (the API refuses
   their write too, and another sponsor's people never reach this sponsor).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create a campaign — SponsorX",
};

async function read<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch (e) {
    if (e instanceof Error && /signed in/i.test(e.message)) throw e;
    return null;
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <FocusShell
      step={0}
      count={1}
      progress={0}
      progressLabel="Campaign progress"
      progressText="Not started"
      home={{ href: "/sponsor", label: "Back to your dashboard" }}
      exit={{ href: "/sponsor/campaigns", label: "Back to campaigns" }}
      boot={false}
    >
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-12 sm:px-8 lg:pt-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">Create a campaign</p>
        <h1 className="mt-4 text-[clamp(1.9rem,4.4vw,3rem)] font-semibold leading-[1.06] tracking-tight">{title}</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">{body}</p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/sponsor/campaigns" className="bx-cta inline-flex items-center justify-center px-6 text-sm">
            Back to campaigns
          </Link>
          <Link href="/sponsor" className="bx-ghost inline-flex items-center px-5 text-sm">
            Your dashboard
          </Link>
        </div>
      </main>
    </FocusShell>
  );
}

export default async function NewCampaignPage() {
  const actor = await requirePortalAccess("sponsor");

  if (!actor.roles.includes("SPONSOR_ADMIN")) {
    const viewer = actor.roles.includes("SPONSOR_ANALYST");
    return (
      <Closed
        title={viewer ? "Only a sponsor admin can create a campaign" : "This login has no sponsor behind it"}
        body={
          viewer
            ? "Your login can read your company's campaigns, requests and reports, but it can't start a new one. Ask a sponsor admin on your team to create it, or to change your role on the Team page."
            : "You're signed in as a BTG preview, so there is no sponsor to create a campaign for. BTG creates campaigns from the admin workspace."
        }
      />
    );
  }
  if (!actor.sponsorId) {
    return <Closed title="This login isn't linked to a sponsor account" body="SponsorX can't find the sponsor account this login belongs to, so a campaign can't be created from it. Ask BTG to link it." />;
  }

  const [catalogue, targeting] = await Promise.all([read<BuilderCatalogue>("/campaign-builder/catalogue"), read<Partial<BuilderTargeting>>("/catalogue/targeting")]);
  if (!isCatalogue(catalogue)) {
    return <Closed title="The campaign builder couldn't be opened just now" body="Nothing was lost and nothing was sent. Refresh in a minute, or come back from your Campaigns page." />;
  }

  return (
    <SponsorCampaignBuilder
      catalogue={catalogue}
      /* With no answer the builder still works: any sport, every US state, the United States only. */
      targeting={{ sports: strings(targeting?.sports), stateCodes: strings(targeting?.stateCodes), countryCodes: strings(targeting?.countryCodes) }}
      now={new Date().toISOString()}
    />
  );
}
