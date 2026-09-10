  import { ScreenStub } from "@/components/screen-stub";

  export default function Page() {
    return (
      <ScreenStub
        title={'Athlete Earnings'}
        blueprintRef={'§24 · §21'}
        surface={'athlete portal'}
        purpose={'Pending, eligible, approved and paid — status only.'}
        todo={[
  'No tax ID, no bank details (§26, Addendum A6)',
  'Earning.reference holds a Zoho/payment reference, never credentials',
]}
        note={undefined}
      />
    );
  }
