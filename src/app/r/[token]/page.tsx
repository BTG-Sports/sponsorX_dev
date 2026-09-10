// Fan redeem page - §16.
// Guide §06: must render without JavaScript. Server component, no client
// bundle, no font that blocks paint. It is hit on a phone, on venue wifi,
// once. Keep it a plain dynamic route: no ISR, no edge middleware.
export default async function RedeemPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // TODO: redeem(token) from src/server/domain/reward.ts once the schema
  // exists. Single-use is enforced by the partial unique index on
  // RewardEvent(tokenId) WHERE type = 'REDEEM' - catch the constraint
  // violation and render "already used".
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        BTG SponsorX Reward
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Reward pending
      </h1>
      <p className="mt-3 text-sm text-muted">
        Token <code className="font-mono text-xs">{token}</code> is not wired
        to a reward yet.
      </p>
      <p className="mt-8 text-xs text-faint">
        Four events, four rows: SCAN, LANDING, CLAIM, REDEEM (§16).
      </p>
    </main>
  );
}
