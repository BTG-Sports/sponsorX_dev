import { WardSwitcher } from "@/components/ward-switcher";
import type { Actor } from "@/server/api";

/* --------------------------------------------------------------------------
   Who acts for the account — 2S1-FE-08 (2S1-BE-11). For an athlete under
   their place's age of majority, every agreement and money action comes
   from their guardian's own login:

   - the GUARDIAN sees whose account they are acting for (and, looking after
     several, can switch) — accepting, listing and payouts here are for them;
   - the MINOR sees that those actions are their guardian's. They can still
     view everything and upload their content; their guardian is emailed
     for each upload.

   From GET /me (wards, actingFor, guardianControl). Nothing for an adult.
   -------------------------------------------------------------------------- */

export function GuardianControlNotice({ actor }: { actor: Actor }) {
  const wards = actor.wards ?? [];
  if (actor.actingFor) {
    const ward = wards.find((w) => w.athleteId === actor.actingFor);
    const name = ward?.firstName ?? "your athlete";
    return (
      <section aria-label="Acting for" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3.5">
        <p className="min-w-0 max-w-xl text-sm leading-relaxed">
          You&rsquo;re signed in as {name}&rsquo;s guardian. Agreements you accept, items you list and payouts you set up or ask for here are for {name}.
        </p>
        {wards.length > 1 && <WardSwitcher wards={wards} current={actor.actingFor} />}
      </section>
    );
  }
  if (actor.roles.includes("GUARDIAN") && !actor.roles.includes("ATHLETE")) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        You&rsquo;re signed in as a guardian. No athlete you look after needs you to act for them right now.
      </p>
    );
  }
  if (actor.guardianControl) {
    const g = actor.guardianControl.guardianName ?? "Your guardian";
    return (
      <section aria-label="Your guardian" className="rounded-xl border border-line bg-surface px-4 py-3.5">
        <p className="text-sm leading-relaxed">
          <strong className="font-semibold">{g}</strong> accepts your agreements and offers, lists your items and handles your payouts — from their own login.
        </p>
        <p className="mt-1 text-xs text-muted">You can see everything here and upload your own content. {g.split(/\s+/)[0]} gets an email each time you upload.</p>
      </section>
    );
  }
  return null;
}
