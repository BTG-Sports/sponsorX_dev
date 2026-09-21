import { JoinWizard } from "@/components/join-wizard";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door. P1-ART-07 built in-app:
   the phone-first progressive wizard (one section per screen, the §4 guardian
   branch, localStorage drafts, v0.4 click-wrap, after-submit state).

   Fixtures-only: submit transitions state, no POST — P3-FE-01 wires the API.
   ?demo=minor lands on section 1 with an under-18 DOB; ?demo=submitted lands
   on the after-submit state with the guardian card.
   -------------------------------------------------------------------------- */

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const d = demo === "submitted" ? "submitted" : demo === "minor" ? "minor" : null;

  return (
    <div className="sx-join-stage">
      <div className="mx-auto w-full max-w-[430px]">
        <JoinWizard demo={d} />
      </div>
    </div>
  );
}
