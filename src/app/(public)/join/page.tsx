  import { ScreenStub } from "@/components/screen-stub";

  export default function Page() {
    return (
      <ScreenStub
        title={'Athlete Application'}
        blueprintRef={'§11'}
        surface={'public'}
        purpose={'Ten sections of onboarding capture, ending in DRAFT → SUBMITTED.'}
        todo={[
  'Identity, sports, social, capabilities, brand interests, restrictions (§11)',
  'Guardian / authorized-rep branch when a DOB indicates a minor (§4)',
  'Content Collaboration Agreement acceptance — blocked until counsel approves templates (§12)',
  'Zod contract in src/contracts/athlete.ts first (guide §12)',
]}
        note={'Absent from mockup v1.0 entirely. §39 makes this the front door of the whole product.'}
      />
    );
  }
