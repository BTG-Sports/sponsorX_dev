// Fan redeem page - §16.
// Guide §06: must render without JavaScript. Server component, NO imports, no
// client bundle, no font that blocks paint. It is hit on a phone, on venue
// wifi, once. Keep it a plain dynamic route: no ISR, no edge middleware, and
// no component imports — hand-rolled markup only, so nothing can pull a client
// island into this tree. The only script above it is the root layout's
// pre-paint theme line (progressive enhancement); with JS off this page is a
// fixed dark brand ground (dark default, no theme toggle here).

// The QR lifecycle §16 models. LANDING is the stage THIS page represents.
const STEPS = [
  { key: "SCAN", detail: "Fan scans the QR at the event." },
  { key: "LANDING", detail: "This page — matching your scan to a reward." },
  { key: "CLAIM", detail: "Confirm to attach the reward to you." },
  { key: "REDEEM", detail: "Show proof at the booth. Single-use." },
] as const;

const CURRENT = "LANDING";

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c10] bg-[linear-gradient(160deg,rgba(46,155,245,.18),transparent_55%),linear-gradient(320deg,rgba(249,122,31,.12),transparent_50%)] px-6 py-16 text-center text-on-media">
      <div className="w-full max-w-sm">
        {/* wordmark — text only, no image dependency */}
        <p className="text-sm font-bold tracking-tight">
          Sponsor<span className="text-[#2e9bf5]">X</span>
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/50">
          BTG · Fan reward
        </p>

        <h1 className="mt-8 text-3xl font-bold tracking-tight">
          Reward pending
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-on-media/70">
          We have your scan. This token is not wired to a reward on this build,
          so there is nothing to claim yet.
        </p>

        {/* token */}
        <div className="mt-6 rounded-xl border border-on-media/10 bg-on-media/5 px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-on-media/40">
            Reward token
          </p>
          <code className="mt-1.5 block break-all font-mono text-lg font-semibold text-on-media">
            {token}
          </code>
        </div>

        {/* SCAN → LANDING → CLAIM → REDEEM — ordered, current stage marked */}
        <ol className="mt-8 space-y-2 text-left">
          {STEPS.map((s, i) => {
            const active = s.key === CURRENT;
            return (
              <li
                key={s.key}
                aria-current={active ? "step" : undefined}
                className={[
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  active
                    ? "border-[#2e9bf5]/60 bg-[#2e9bf5]/12"
                    : "border-on-media/10 bg-on-media/[0.03]",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                    active
                      ? "bg-[#2e9bf5] text-white"
                      : "bg-on-media/10 text-on-media/60",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "text-xs font-semibold uppercase tracking-wide",
                        active ? "text-on-media" : "text-on-media/70",
                      ].join(" ")}
                    >
                      {s.key}
                    </span>
                    {active && (
                      <span className="rounded-full bg-[#2e9bf5]/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[#8fcbfb]">
                        You are here
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-on-media/50">
                    {s.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-8 text-[10px] leading-relaxed text-on-media/40">
          Renders without JavaScript — one page, one scan, one reward (§16).
          Single-use is enforced server-side once the reward schema lands.
        </p>
      </div>
    </main>
  );
}
