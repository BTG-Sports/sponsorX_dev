  import { ScreenStub } from "@/components/screen-stub";

  export default function Page() {
    return (
      <ScreenStub
        title={'Campaign Invitations'}
        blueprintRef={'§21 · §13 step 5'}
        surface={'athlete portal'}
        purpose={'INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED.'}
        todo={[
  'CampaignInvite model, added in guide V2 §03',
  'Viewing an invitation is a state transition — record it',
]}
        note={undefined}
      />
    );
  }
