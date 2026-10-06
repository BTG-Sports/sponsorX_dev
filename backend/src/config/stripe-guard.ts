/**
 * Stripe's boot guard — 2S5-INT-01 / -03.
 *
 * Pure (no env import), so the rules are unit-testable alone; config/env.ts
 * runs it at boot and refuses to start on any problem it names.
 *
 *   - PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 *   - A LIVE key (sk_live_ / rk_live_) is refused unless RAILWAY_ENVIRONMENT_NAME
 *     is exactly "production" — whatever the provider setting, because a live
 *     key on staging or a laptop can move real money the moment someone flips
 *     the provider.
 *   - A TEST key (sk_test_ / rk_test_) is refused in production when Stripe is
 *     the provider: sponsors would "pay" on a sandbox page and nothing would
 *     be charged.
 *   - Anything that is not a Stripe secret key at all is refused.
 *
 * Messages NEVER contain the key, or any part of it.
 */
export type StripeGuardInput = {
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RAILWAY_ENVIRONMENT_NAME?: string;
};

export type StripeKeyMode = "live" | "test" | "unknown";

/** Which mode a Stripe secret key is for, from its prefix only. */
export function stripeKeyMode(key: string): StripeKeyMode {
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "unknown";
}

/** Why this configuration must not boot, or null when it may. */
export function stripeConfigProblem(e: StripeGuardInput): string | null {
  const key = e.STRIPE_SECRET_KEY?.trim() || "";
  const stripe = e.PAYMENT_PROVIDER === "stripe";
  const production = e.RAILWAY_ENVIRONMENT_NAME === "production";
  if (stripe && !key) return "PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY is not set. Refusing to boot.";
  if (stripe && !e.STRIPE_WEBHOOK_SECRET?.trim()) {
    return "PAYMENT_PROVIDER=stripe but STRIPE_WEBHOOK_SECRET is not set: Stripe's webhook could not be verified, so no payment would ever be confirmed. Refusing to boot.";
  }
  if (!key) return null;
  const mode = stripeKeyMode(key);
  if (mode === "unknown") return "STRIPE_SECRET_KEY is not a Stripe secret key (sk_live_/sk_test_/rk_live_/rk_test_). Refusing to boot.";
  if (mode === "live" && !production) {
    return `STRIPE_SECRET_KEY is a LIVE key, but RAILWAY_ENVIRONMENT_NAME is ${e.RAILWAY_ENVIRONMENT_NAME ? `"${e.RAILWAY_ENVIRONMENT_NAME}"` : "unset"}, not "production". A live key outside production could move real money. Refusing to boot.`;
  }
  if (mode === "test" && stripe && e.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production") {
    return "STRIPE_SECRET_KEY is a TEST key in production: sponsors would pay on a sandbox page and nothing would be charged. Refusing to boot.";
  }
  return null;
}
