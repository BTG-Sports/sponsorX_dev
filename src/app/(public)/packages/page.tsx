  import { ScreenStub } from "@/components/screen-stub";

  export default function Page() {
    return (
      <ScreenStub
        title={'Sponsor Package Catalog'}
        blueprintRef={'§9 screen 4 · §7'}
        surface={'public'}
        purpose={'The six standardized packages, from the $750 Test Drive to the $15-30K Season Partner. Phase 1 sponsors request or reserve — there is no self-checkout.'}
        todo={[
  'Six packages from §7 with price, athlete count, inventory',
  'Filters: sport, geography, athlete tier, job type, budget (§9.4)',
  'Request-a-brief CTA into CampaignBrief (§13 step 2)',
]}
        note={'The mockup showed media inventory at $16-20 CPM instead of packages. Phase 1 sells packages; implied CPM is stored for learning only (§15).'}
      />
    );
  }
