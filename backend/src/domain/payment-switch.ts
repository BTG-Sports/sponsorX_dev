/**
 * POL-BE-36 — BTG's payments switch.
 *
 * Until now the only way to open or close payment was the Railway setting
 * `PAYMENT_PROVIDER` (none / stripe): changing it restarts production, and
 * only someone with Railway access can. This is the switch on BTG's admin
 * screen: on or off at once, no deploy.
 *
 * PAYMENT IS OPEN only while BOTH are on: the Railway setting names a
 * provider (it stays the master off — `providerName()` "none" closes
 * everything), and this switch is on. While it is off:
 *   - no checkout: the card-payment link is refused, and `canPay` is false;
 *   - no transfer: an approved payout isn't handed to the provider, and
 *     waits (sending is queued again when payment opens, below);
 *   - no payout-account set-up;
 *   - no cancellation for non-payment: approved orders wait with no
 *     deadline, and get three fresh days once it opens (POL-BE-04,
 *     order-payment.ts, which reads `paymentsOpen()`).
 * The provider's webhooks are NOT gated: what is already moving (a payment
 * a sponsor finished, a refund, a payout in flight) still settles.
 *
 * ONE ROW for the platform, because there is one provider account. Read and
 * changed by BTG Admin and Finance (`paymentSwitch` in the policy) of a
 * top-level organisation — one no other runs — or a super admin: an
 * operated school's staff never reach it. A change needs a reason, is
 * audited, and turning it ON needs a provider configured (production's boot
 * guard already refuses `stripe` without its live key and webhook secret,
 * config/stripe-guard.ts). With no row yet it is off in production — so
 * switching Railway to Stripe opens nothing by itself — and on elsewhere.
 */
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { providerName, type ProviderName } from "../lib/payment-provider";

const ID = "payments";
const isProduction = () => env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production";

export class PaymentSwitchError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "PaymentSwitchError";
    this.status = status;
  }
}

/** BTG's switch alone: the row, or the default when nobody has set it. */
async function switchOn(): Promise<boolean> {
  const row = await prisma.paymentSwitch.findUnique({
    /* tenant-scope: the one platform-wide row; it carries no tenant. */
    where: { id: ID }, select: { open: true },
  });
  return row ? row.open : !isProduction();
}

/** Can a sponsor pay, and a payee be paid, right now? Railway names a provider AND BTG's switch is on. */
export async function paymentsOpen(): Promise<boolean> {
  return providerName() !== "none" && (await switchOn());
}

/** The provider money moves through right now: the configured one while payment is open, else "none". */
export async function activeProvider(): Promise<ProviderName> {
  return (await paymentsOpen()) ? providerName() : "none";
}

/** Payments' own staff: BTG Admin or Finance of a top-level organisation, or a super admin. */
async function assertSwitchStaff(actor: Actor, action: "read" | "write") {
  const scope = assertTenantWide(actor, "paymentSwitch", action);
  if (scope === "any") return;
  const tenant = await prisma.tenant.findFirst({
    /* tenant-scope: the actor's own tenant row. */
    where: { id: actor.tenantId }, select: { operatorTenantId: true },
  });
  if (!tenant || tenant.operatorTenantId) throw new ForbiddenError("paymentSwitch", action);
}

async function view(actor: Actor) {
  const row = await prisma.paymentSwitch.findUnique({
    /* tenant-scope: the one platform-wide row; it carries no tenant. */
    where: { id: ID }, select: { open: true, reason: true, changedAt: true, changedByEmail: true },
  });
  const history = await prisma.auditLog.findMany({
    where: { tenantId: actor.tenantId, action: "paymentSwitch.change", entity: "PaymentSwitch" },
    select: { at: true, after: true }, orderBy: { at: "desc" }, take: 20,
  });
  const provider = providerName();
  const on = row ? row.open : !isProduction();
  return {
    /** BTG's switch. */
    on,
    /** Whether payment is actually open: the switch AND a provider configured. */
    open: provider !== "none" && on,
    /** The Railway setting — "none" keeps payment closed whatever the switch says. */
    provider,
    /** Turning it on needs a provider configured. */
    canTurnOn: provider !== "none",
    /** Null until someone first sets it (the default is shown in `on`). */
    changed: row ? { at: row.changedAt.toISOString(), by: row.changedByEmail, reason: row.reason } : null,
    history: history.map((h) => {
      const a = (h.after ?? {}) as { open?: boolean; reason?: string; by?: string };
      return { at: h.at.toISOString(), on: Boolean(a.open), reason: a.reason ?? "", by: a.by ?? null };
    }),
  };
}

/** GET /payments/switch — where the switch stands, who last changed it and why, and the recent changes. */
export async function readPaymentSwitch(actor: Actor) {
  await assertSwitchStaff(actor, "read");
  return view(actor);
}

/**
 * PUT /payments/switch — turn payment on or off, with a reason. Off always
 * works; on needs a provider configured. Turning it on from off hands every
 * approved payout that waited to the send queue (sending is conditional, so
 * one already sent is untouched); orders waiting to pay get their three days
 * on the unpaid-order sweep's next pass. `tenantIds` limits that release to
 * named books (a test, as the sweeps take it); the route passes none.
 */
export async function setPaymentSwitch(actor: Actor, input: { open: boolean; reason: string }, now = new Date(), opts: { tenantIds?: string[] } = {}) {
  await assertSwitchStaff(actor, "write");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new PaymentSwitchError("Say why — the reason is kept with the change.", 422);
  if (input.open && providerName() === "none") {
    throw new PaymentSwitchError("Payments can't be turned on yet: production has no payment provider set up. The Railway setting PAYMENT_PROVIDER is the master off.");
  }
  const by = await prisma.user.findFirst({
    where: { id: actor.userId ?? "", tenantId: actor.tenantId }, select: { email: true },
  });
  await prisma.$transaction(async (tx) => {
    const before = await tx.paymentSwitch.findUnique({
      /* tenant-scope: the one platform-wide row; it carries no tenant. */
      where: { id: ID }, select: { open: true },
    });
    await tx.paymentSwitch.upsert({
      /* tenant-scope: the one platform-wide row; only payments' staff of a top-level organisation reach here. */
      where: { id: ID },
      create: { id: ID, open: input.open, reason, changedAt: now, changedById: actor.userId ?? null, changedByEmail: by?.email ?? null },
      update: { open: input.open, reason, changedAt: now, changedById: actor.userId ?? null, changedByEmail: by?.email ?? null },
    });
    await audit(tx, actor, "paymentSwitch.change", "PaymentSwitch", ID, {
      before: { open: before ? before.open : !isProduction(), set: Boolean(before) },
      after: { open: input.open, reason, by: by?.email ?? null },
    });
    const wasOn = before ? before.open : !isProduction();
    if (input.open && !wasOn) {
      const waiting = await tx.payout.findMany({
        /* tenant-scope: payment opening is platform-wide — every set of books' (or opts.tenantIds') approved payouts that waited go now, each queued in its own. */
        where: { state: "APPROVED", ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) }, select: { id: true, tenantId: true }, take: 5000,
      });
      for (const p of waiting) await enqueue(tx, p.tenantId, "payouts.send", { payoutId: p.id });
    }
  });
  return view(actor);
}
