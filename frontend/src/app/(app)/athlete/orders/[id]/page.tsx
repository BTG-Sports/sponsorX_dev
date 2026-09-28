import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Button, Card, SectionHeading } from "@/components/ui";
import { resolveBack } from "@/lib/back";
import { demoState } from "@/lib/demo";
import {
  INVITE_COPY,
  athlete,
  athleteMinor,
  invitations,
  money,
  orderTerms,
  type InviteState,
} from "@/lib/fixtures";
import { OrderAccept } from "@/components/order-accept";
import {
  acceptBlocker,
  ORDER_STATE_COPY,
  type ApiOrder,
} from "@/lib/order-live";
import { apiFetch, fetchActor } from "@/server/api";
import { acceptOrderAction } from "./actions";

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

   LIVE vs DEMO (P5-FE-01). For a signed-in athlete (or their guardian, read
   only) the id is a REAL order: GET /orders/{id} returns the frozen terms,
   guardian readiness and the issued Campaign Order agreement body, which is
   rendered verbatim — and the accept action hashes exactly that string, so
   the fingerprint the API checks is of the words on this screen. The body is
   DRAFT wording until counsel issues the template (G-05); the draft says so
   in its first line, and every draft acceptance is void (agreement-hash.ts).
   Anyone else, or any ?demo= state, keeps the fixture order below.
   -------------------------------------------------------------------------- */

const ORDER_TONE: Record<string, "primary" | "accent" | "neutral" | "danger" | "warn"> = {
  DRAFT: "neutral",
  SENT: "primary",
  ACCEPTED: "accent",
  ACTIVE: "accent",
  COMPLETED: "neutral",
  REJECTED: "neutral",
  CANCELLED: "danger",
};

type LiveOrder = { kind: "order"; order: ApiOrder; isAthlete: boolean } | { kind: "missing" };

/** The real order for a signed-in athlete or guardian, or null for the demo. */
async function liveOrder(id: string): Promise<LiveOrder | null> {
  /* No catch — an outage is an error page, never a fixture order dressed as
     the athlete's own contract (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  const isAthlete = who.actor.roles.includes("ATHLETE");
  if (!isAthlete && !who.actor.roles.includes("GUARDIAN")) return null;
  const res = await apiFetch(`/orders/${encodeURIComponent(id)}`);
  /* 403 is the API's answer for "not yours" and "no such order" alike. */
  if (res.status === 403) return { kind: "missing" };
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  return { kind: "order", order: (await res.json()) as ApiOrder, isAthlete };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function LiveOrderView({
  order: o,
  isAthlete,
  back,
}: {
  order: ApiOrder;
  isAthlete: boolean;
  back: ReturnType<typeof resolveBack>;
}) {
  const blocker = acceptBlocker(o, isAthlete);
  const guardianNeeded = o.guardian.status !== "not-required";
  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{o.campaign.name}</h1>
            <Badge tone="neutral">{o.jobId}</Badge>
            <Badge tone={ORDER_TONE[o.state] ?? "neutral"}>
              {ORDER_STATE_COPY[o.state] ?? o.state}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Presented by {o.campaign.sponsorName} · {o.jobName}
          </p>
        </div>
        {typeof o.compensation === "number" && (
          <div className="text-right">
            <p className="text-[11px] text-muted">You&rsquo;re paid</p>
            <p className="text-2xl font-semibold tabular-nums leading-tight">
              {money(o.compensation)}
            </p>
            <p className="text-[11px] text-faint">due {fmtDate(o.dueDate)}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHeading
              title="Order details"
              hint="Fixed on the order when BTG sent it — they don't change"
            />
            <Card>
              <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                {[
                  ["Job", `${o.jobId} · ${o.jobName}`],
                  ["Compensation", typeof o.compensation === "number" ? money(o.compensation) : "—"],
                  ["Due", fmtDate(o.dueDate)],
                  ["Campaign window", `${fmtDate(o.campaign.startDate)} – ${fmtDate(o.campaign.endDate)}`],
                  ["Usage rights", o.usageRights],
                  ["Exclusivity", o.exclusivity ?? "None"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-faint">{k}</dt>
                    <dd className="mt-0.5 font-medium text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>

          <section>
            <SectionHeading
              title="Campaign Order agreement"
              hint={o.agreement ? `Version ${o.agreement.version}` : "not issued yet"}
            />
            <Card>
              {o.agreement?.body ? (
                /* Rendered verbatim — the accept action hashes this exact
                   string, so nothing here may reflow or trim it. */
                <pre
                  data-agreement-body
                  className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted"
                >
                  {o.agreement.body}
                </pre>
              ) : (
                <p className="text-xs text-muted">
                  {o.agreement
                    ? "The agreement text can't be shown right now."
                    : "BTG hasn't issued the Campaign Order agreement yet."}
                </p>
              )}
            </Card>
          </section>
        </div>

        <div className="space-y-4">
          <Card>
            {o.state === "SENT" ? (
              <>
                <SectionHeading title="Accept this order" />
                <OrderAccept
                  orderId={o.id}
                  agreementId={o.agreement?.id ?? null}
                  body={o.agreement?.body ?? null}
                  version={o.agreement?.version ?? null}
                  blocker={blocker}
                  accept={acceptOrderAction}
                />
              </>
            ) : (
              <>
                <SectionHeading title="Order status" />
                <Badge tone={ORDER_TONE[o.state] ?? "neutral"}>
                  {ORDER_STATE_COPY[o.state] ?? o.state}
                </Badge>
                {o.acceptance ? (
                  <dl className="mt-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Accepted</dt>
                      <dd className="text-muted">{fmtDate(o.acceptance.acceptedAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Agreement</dt>
                      <dd className="text-muted">version {o.acceptance.version}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Fingerprint</dt>
                      <dd className="truncate font-mono text-muted" title={o.acceptance.bodyHash}>
                        {o.acceptance.bodyHash.slice(0, 19)}…
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    {blocker ?? "Nothing for you to do on this order right now."}
                  </p>
                )}
                {o.acceptance && (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    Its deliverables are now on your calendar.
                  </p>
                )}
              </>
            )}
          </Card>

          {guardianNeeded ? (
            <Card>
              <SectionHeading title="Guardian authorization" />
              <p className="text-[11px] leading-relaxed text-muted">
                You&rsquo;re under 18, so a verified parent or guardian must
                authorize this order before it can be accepted (§4). Their
                authorization is recorded with your acceptance.
              </p>
              <div className="mt-2">
                {o.guardian.status === "ready" ? (
                  <Badge tone="accent">{o.guardian.name ?? "Guardian"} · verified</Badge>
                ) : o.guardian.status === "unverified" ? (
                  <Badge tone="warn">{o.guardian.name ?? "Guardian"} · verification pending</Badge>
                ) : (
                  <Badge tone="warn">No guardian linked yet</Badge>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-[11px] font-medium text-muted">Earnings, not payment</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                Accepting starts this order&rsquo;s earning at pending. SponsorX
                holds no bank details and no tax ID; payment happens outside
                the system in Phase 1 (§26).
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Same state → tone mapping as the invitations inbox. */
const STATE_TONE: Record<InviteState, "primary" | "accent" | "neutral" | "danger" | "warn"> = {
  INVITED: "primary",
  VIEWED: "warn",
  ACCEPTED: "accent",
  DECLINED: "neutral",
  EXPIRED: "danger",
};

export default async function CampaignOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const demo = await demoState(searchParams);
  /* §4 — ?demo=minor renders this order as seen by a minor whose guardian
     is still unverified; the guardian rail below keys off it. */
  const a = demo === "minor" ? athleteMinor : athlete;
  const back = resolveBack(from, "athlete-invitations");

  const live = demo === null ? await liveOrder(id) : null;
  if (live?.kind === "order") {
    return <LiveOrderView order={live.order} isAthlete={live.isAthlete} back={back} />;
  }
  if (live?.kind === "missing") {
    return (
      <div className="space-y-4">
        <BackLink target={back} />
        <Card>
          <p className="text-sm font-medium">Order not found</p>
          <p className="mt-1 text-xs text-muted">
            This order doesn&rsquo;t exist or isn&rsquo;t yours to view.
          </p>
        </Card>
      </div>
    );
  }

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
            <Badge tone={STATE_TONE[inv.state]}>
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
          {actionable ? (
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
          ) : (
            <Card>
              <SectionHeading title="Order status" />
              <Badge tone={STATE_TONE[inv.state]}>
                {INVITE_COPY[inv.state]}
              </Badge>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {inv.state === "DECLINED" &&
                  (inv.declineReason ??
                    "This invitation was declined; no Campaign Order was created.")}
                {inv.state === "EXPIRED" &&
                  "This invitation expired before a response. The sponsor can re-invite through BTG."}
                {inv.state === "ACCEPTED" &&
                  "This order is live — its deliverables are tracked on your dashboard."}
              </p>
              <div className="mt-3">
                <Button variant="secondary" full href="/athlete/invitations">
                  Back to invitations
                </Button>
              </div>
            </Card>
          )}

          {a.isMinor ? (
            <Card>
              <SectionHeading title="Guardian authorization" />
              <p className="text-[11px] leading-relaxed text-muted">
                {a.firstName} is a minor. §4 requires a verified guardian
                to authorize this order before it can be accepted.
              </p>
              <div className="mt-2">
                {a.guardian?.verifiedAt ? (
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
