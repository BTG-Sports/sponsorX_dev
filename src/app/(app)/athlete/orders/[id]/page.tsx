import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Button, Card, SectionHeading } from "@/components/ui";
import { resolveBack } from "@/lib/back";
import {
  INVITE_COPY,
  athlete,
  invitations,
  money,
  orderTerms,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Order — §12, guide §08. Athlete portal.

   The commercial terms behind an invitation, and the acceptance that would
   turn them into live deliverables. Compensation shown here is what the
   ATHLETE is paid — this is their own order, so the amount is theirs to see
   (the field-level rule in guide §04 hides it from sponsors, not from the
   athlete).

   Acceptance is deliberately blocked. Guide §08: acceptance hashes the
   rendered agreement body, and the Campaign Order template has not cleared
   counsel. Accepting now would hash an unenforceable agreement. For minors,
   §4 additionally requires a verified guardian before any acceptance. UI is
   built; the acceptOrder domain function is B4.
   -------------------------------------------------------------------------- */

export default async function CampaignOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "athlete-invitations");
  const inv = invitations.find((i) => i.id === id);

  if (!inv) {
    return (
      <div className="space-y-4">
        <BackLink target={back} />
        <Card>
          <p className="text-sm font-medium">Order not found</p>
          <p className="mt-1 text-xs text-muted">
            No invitation matches <code className="font-mono">{id}</code>.
          </p>
        </Card>
      </div>
    );
  }

  // Deliverable specs are synthesised from the invite for the demo; the real
  // ones are auto-created by acceptOrder (§21, B4).
  const deliverables = Array.from({ length: inv.deliverableCount }, (_, i) => ({
    n: i + 1,
    label: `${inv.jobName}${inv.deliverableCount > 1 ? ` — part ${i + 1}` : ""}`,
  }));
  const actionable = inv.state === "INVITED" || inv.state === "VIEWED";

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* -------------------------------------------------------- headline */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {inv.campaign}
            </h1>
            <Badge tone="neutral">{inv.jobId}</Badge>
            <Badge tone={actionable ? "primary" : "neutral"}>
              {INVITE_COPY[inv.state]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Presented by {inv.sponsor} · {inv.jobName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted">You&rsquo;re paid</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">
            {money(inv.offered)}
          </p>
          <p className="text-[11px] text-faint">
            {actionable ? `expires in ${inv.expiresIn}` : inv.expiresIn}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        {/* ================================================= main column */}
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------- commercial terms */}
          <section>
            <SectionHeading title="Commercial terms" />
            <Card>
              <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                {[
                  ["Compensation", money(inv.offered)],
                  ["Deliverables", String(inv.deliverableCount)],
                  ["Usage rights", inv.usageRights],
                  ["Exclusivity", inv.exclusivity ?? "None"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-faint">{k}</dt>
                    <dd className="mt-0.5 font-medium text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">
                {orderTerms.paymentSchedule}
              </p>
            </Card>
          </section>

          {/* ---------------------------------------------- deliverables */}
          <section>
            <SectionHeading
              title="Deliverables"
              hint="Auto-created on acceptance, then tracked NOT_STARTED → … → VERIFIED (§21)"
            />
            <Card>
              <ol className="space-y-0">
                {deliverables.map((d, i) => (
                  <li key={d.n} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-athlete/30 bg-athlete/15 text-[11px] font-semibold text-athlete">
                        {d.n}
                      </span>
                      {i < deliverables.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="w-px flex-1 bg-athlete/25"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-4 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {d.label}
                        </span>
                        <Badge tone="neutral">Not started</Badge>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </section>

          {/* ------------------------------------------------- agreement */}
          <section>
            <SectionHeading
              title="Campaign Order agreement"
              hint={orderTerms.agreementVersion}
            />
            <Card>
              <ul className="space-y-2">
                {orderTerms.clauses.map((c, i) => (
                  <li key={c} className="flex gap-2.5 text-xs">
                    <span className="text-faint tabular-nums">{i + 1}.</span>
                    <span className="text-muted">{c}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">
                On acceptance, SponsorX stores a hash of the rendered agreement
                body — not the checkbox alone — so what was agreed to can be
                proven later (guide §08).
              </p>
            </Card>
          </section>
        </div>

        {/* ==================================================== side rail */}
        <div className="space-y-4">
          <Card>
            <SectionHeading title="Accept this order" />
            <div className="space-y-2">
              <Button
                full
                disabled
                title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
              >
                Review &amp; accept
              </Button>
              <Button variant="secondary" full href="/athlete/invitations">
                Decline
              </Button>
            </div>

            <BlockedNotice>
              Acceptance is not wired. Guide §08 blocks it until counsel approves
              the Campaign Order template — the acceptOrder domain function (B4)
              hashes whatever text it is shown.
            </BlockedNotice>
          </Card>

          {athlete.isMinor ? (
            <Card>
              <SectionHeading title="Guardian authorization" />
              <p className="text-[11px] leading-relaxed text-muted">
                {athlete.firstName} is a minor. §4 requires a verified guardian
                to authorize this order before it can be accepted.
              </p>
              <div className="mt-2">
                {athlete.guardian?.verifiedAt ? (
                  <Badge tone="accent">Guardian verified</Badge>
                ) : (
                  <Badge tone="warn">Guardian verification pending</Badge>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-[11px] font-medium text-muted">
                Earnings, not payment
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Accepting tracks this order&rsquo;s earning through its states.
                SponsorX holds no bank details and no tax ID; payout happens
                outside the system in Phase 1 (§26).
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
