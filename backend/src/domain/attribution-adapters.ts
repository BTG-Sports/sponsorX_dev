/**
 * The attribution adapter framework — 3S6-BE-01
 * (documentation/SponsorX-Attribution-Framework.md).
 *
 * "Attribution is pluggable, never universal. Each adapter declares its
 * method, lookback window and match approach." Done when "a new attribution
 * partner can be added as an adapter without changing the engine."
 *
 * An ADAPTER is one partner format: what it is called, how it may attribute
 * (deterministic first; probabilistic only if it says so — the claims rule,
 * SponsorX-Attribution-Claims.md §1), how far back a sale may be credited,
 * which exact keys it carries, how its data arrives, and how to turn a
 * delivery into partner events. The engine (attribution-intake.ts) knows
 * only this interface: adding a partner format is registering an adapter.
 *
 * A PARTNER EVENT is what an adapter hands the engine: one sale or refund,
 * with the partner's own id, when it happened, the amount, and the exact keys
 * it carries (a SponsorX reward token, an order id, a SponsorX click id).
 * Matching those keys to campaigns is 3S6-BE-03; the normalised event table
 * is 3S6-BE-02.
 */
import { z } from "../contracts/zod";

export type AttributionMethod = "deterministic" | "probabilistic";
export type MatchKey = "token" | "order_id" | "click_id";

export type PartnerEvent = {
  /** The partner's own id for the event — unique per partner. */
  externalId: string;
  kind: "sale" | "refund";
  occurredAt: string;
  amountCents: number | null;
  currency: string;
  /** The exact keys it carries; a deterministic match needs at least one. */
  keys: Partial<Record<MatchKey, string>>;
};

export type ParseResult = { events: PartnerEvent[]; problems: string[] };

export interface AttributionAdapter {
  key: string;
  name: string;
  /** In the order they are tried: deterministic always first. */
  methods: readonly AttributionMethod[];
  /** A sale this many days after the campaign's last exposure is not credited. */
  lookbackDays: number;
  /** The exact keys the partner sends. */
  matchKeys: readonly MatchKey[];
  /** How the partner's data arrives. */
  intake: "webhook";
  /** A delivery → partner events; invalid events are left out, each with its reason. */
  parse(payload: unknown): ParseResult;
}

export class AdapterError extends Error {
  readonly status = 422;
  readonly code = "attribution_adapter";
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

/* ───────────────────────────── the registry ───────────────────────────── */

const registry = new Map<string, AttributionAdapter>();

/**
 * Add an adapter. It must declare deterministic matching first, a lookback of
 * 1–365 days and at least one exact key — the claims rule makes a partner
 * with no exact key unable to produce a verified transaction.
 */
export function registerAdapter(a: AttributionAdapter): void {
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(a.key)) throw new AdapterError(`An adapter key is lowercase letters, digits and dashes: "${a.key}".`);
  if (registry.has(a.key)) throw new AdapterError(`An adapter "${a.key}" is already registered.`);
  if (a.methods[0] !== "deterministic") throw new AdapterError(`${a.name}: deterministic matching comes first.`);
  if (!Number.isInteger(a.lookbackDays) || a.lookbackDays < 1 || a.lookbackDays > 365) throw new AdapterError(`${a.name}: the lookback is 1 to 365 days.`);
  if (!a.matchKeys.length) throw new AdapterError(`${a.name}: at least one exact key (token, order id or click id).`);
  registry.set(a.key, a);
}

export const adapterFor = (key: string): AttributionAdapter | undefined => registry.get(key);
export const adapters = (): AttributionAdapter[] => [...registry.values()].sort((x, y) => x.key.localeCompare(y.key));

/** What a person reads about an adapter: everything but the parser. */
export const describeAdapter = (a: AttributionAdapter) => ({
  key: a.key, name: a.name, methods: [...a.methods], lookbackDays: a.lookbackDays, matchKeys: [...a.matchKeys], intake: a.intake,
});

/* ───────────────────────────── the first adapter ───────────────────────────── */

const GenericEvent = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["sale", "refund"]),
  occurred_at: z.iso.datetime(),
  amount_cents: z.int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  reward_token: z.string().min(1).max(200).optional(),
  order_id: z.string().min(1).max(200).optional(),
  click_id: z.string().min(1).max(200).optional(),
});
const GenericDelivery = z.object({ events: z.array(z.unknown()).min(1).max(500) });

/**
 * The generic partner webhook, v1: a partner POSTs
 * `{ events: [{ id, type: "sale"|"refund", occurred_at, amount_cents?, currency?, reward_token?, order_id?, click_id? }] }`.
 * Deterministic only, 30 days, matched by the SponsorX reward token, the
 * partner's order id or the SponsorX click id.
 */
export const GENERIC_WEBHOOK: AttributionAdapter = {
  key: "generic-webhook-v1",
  name: "Generic partner webhook",
  methods: ["deterministic"],
  lookbackDays: 30,
  matchKeys: ["token", "order_id", "click_id"],
  intake: "webhook",
  parse(payload) {
    const d = GenericDelivery.safeParse(payload);
    if (!d.success) return { events: [], problems: ["The delivery is { events: [ … ] }, 1 to 500 events."] };
    const events: PartnerEvent[] = [];
    const problems: string[] = [];
    d.data.events.forEach((raw, i) => {
      const e = GenericEvent.safeParse(raw);
      if (!e.success) { problems.push(`Event ${i + 1}: ${e.error.issues.map((x) => `${x.path.join(".") || "event"} ${x.message}`).join("; ")}.`); return; }
      const keys: PartnerEvent["keys"] = {
        ...(e.data.reward_token ? { token: e.data.reward_token } : {}),
        ...(e.data.order_id ? { order_id: e.data.order_id } : {}),
        ...(e.data.click_id ? { click_id: e.data.click_id } : {}),
      };
      if (!Object.keys(keys).length) { problems.push(`Event ${i + 1} (${e.data.id}): no reward token, order id or click id — it can't be matched exactly.`); return; }
      events.push({ externalId: e.data.id, kind: e.data.type, occurredAt: e.data.occurred_at, amountCents: e.data.amount_cents ?? null, currency: e.data.currency, keys });
    });
    return { events, problems };
  },
};

registerAdapter(GENERIC_WEBHOOK);
