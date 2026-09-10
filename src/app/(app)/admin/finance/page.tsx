  import { ScreenStub } from "@/components/screen-stub";

  export default function Page() {
    return (
      <ScreenStub
        title={'Finance Workspace'}
        blueprintRef={'§10'}
        surface={'admin'}
        purpose={'Sponsor invoice and payment references, athlete earnings, commission calculations, payout eligibility, reconciliation.'}
        todo={[
  'EarningState machine (§21)',
  'Zoho invoice references inbound only (§18)',
  'BLOCKED on the written Phase 1 payment policy (§37 gate one)',
]}
        note={undefined}
      />
    );
  }
