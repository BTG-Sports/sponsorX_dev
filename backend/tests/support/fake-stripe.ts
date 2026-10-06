import Stripe from "stripe";

/* --------------------------------------------------------------------------
   A stand-in for Stripe's HTTP API, for the Stripe suites (2S5-INT-01 / -03).

   The REAL Stripe SDK is used — it builds every request exactly as it would
   for Stripe (path, form-encoded body, the Idempotency-Key header) — and
   this client answers instead of the network (`useStripeHttpClient`). So a
   test reads precisely what SponsorX would have sent Stripe, and no test
   ever calls Stripe.

   Like Stripe, a POST repeated with the same Idempotency-Key gets the same
   answer. `fail(path, status, error)` makes the next request to a path
   answer with a Stripe error.

   No real key or signing secret appears here or in any suite: the values
   tests use ("sk_test_x", "whsec_…" under twenty characters) are shorter
   than any real one, so `npm run secrets:scan` never mistakes them.
   -------------------------------------------------------------------------- */

export type SeenRequest = {
  method: string; path: string; query: URLSearchParams;
  /** A v1 request's form body. */
  params: URLSearchParams;
  /** A v2 request's JSON body. */
  json: Record<string, unknown> | null;
  idempotencyKey: string | undefined; authorization: string | undefined;
};
/** How a payee's v2 account stands, for GET /v2/core/accounts/:id. */
export type FakeAccountState = "new" | "ready" | "needs_info" | "rejected";
type Json = Record<string, unknown>;

export function fakeStripe(tag: string) {
  const seen: SeenRequest[] = [];
  const answered = new Map<string, Json>();
  const sentWith = new Map<string, string>();
  const failures: Array<{ path: string; status: number; error: Json }> = [];
  const transfers: Json[] = [];
  const accounts = new Map<string, FakeAccountState>();
  const refunds: Json[] = [];
  let n = 0;
  const id = (prefix: string) => `${prefix}_${tag}${++n}${Date.now().toString(36)}`;

  /** `metadata[a]=1&metadata[b]=2` → { a: "1", b: "2" }. */
  const nested = (p: URLSearchParams, key: string): Json => {
    const out: Json = {};
    for (const [k, v] of p) {
      const m = new RegExp(`^${key}\\[([^\\]]+)\\]$`).exec(k);
      if (m) out[m[1]!] = v;
    }
    return out;
  };

  /** A v2 account as Stripe returns it with configuration.recipient and requirements included. */
  const v2Account = (acct: string, state: FakeAccountState, extra: Json = {}): Json => {
    const cap = (status: string, code?: string) => ({ status, status_details: code ? [{ code, resolution: code.startsWith("rejected") ? "contact_stripe" : "provide_info" }] : [] });
    const caps = state === "ready" ? { stripe_transfers: cap("active"), payouts: cap("active") }
      : state === "rejected" ? { stripe_transfers: cap("rejected", "rejected_other"), payouts: cap("rejected", "rejected_other") }
      : { stripe_transfers: cap("restricted", "requirements_past_due"), payouts: cap("restricted", "requirements_past_due") };
    const entries = state === "ready" || state === "rejected" ? [] : [{ awaiting_action_from: "user", description: state === "new" ? "identity.individual.date_of_birth" : "external_account", errors: [], impact: {}, minimum_deadline: { status: "past_due" }, requested_reasons: [] }];
    return {
      id: acct, object: "v2.core.account", dashboard: "express", applied_configurations: ["recipient"], livemode: false, created: new Date().toISOString(),
      configuration: { recipient: { applied: true, capabilities: { stripe_balance: caps } } }, requirements: { entries, summary: {} }, ...extra,
    };
  };

  function answer(method: string, path: string, query: URLSearchParams, p: URLSearchParams, json: Json | null): { status: number; body: Json } {
    if (method === "POST" && path === "/v2/core/accounts") {
      const acct = id("acct");
      accounts.set(acct, "new");
      return { status: 200, body: v2Account(acct, "new", { contact_email: json?.contact_email, display_name: json?.display_name, metadata: json?.metadata ?? {} }) };
    }
    const v2get = /^\/v2\/core\/accounts\/([^/]+)$/.exec(path);
    if (method === "GET" && v2get) {
      const state = accounts.get(v2get[1]!);
      if (!state) return { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `No such account: '${v2get[1]}'` } } };
      return { status: 200, body: v2Account(v2get[1]!, state) };
    }
    if (method === "POST" && path === "/v2/core/account_links") {
      return { status: 200, body: { object: "v2.core.account_link", account: json?.account, url: `https://connect.stripe.com/setup/e/${String(json?.account)}/${id("link")}`, created: new Date().toISOString(), expires_at: new Date().toISOString(), livemode: false, use_case: json?.use_case } };
    }
    if (method === "POST" && path === "/v1/checkout/sessions") {
      const sid = id("cs_test");
      return { status: 200, body: {
        id: sid, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${sid}`, status: "open", payment_status: "unpaid",
        mode: p.get("mode"), client_reference_id: p.get("client_reference_id"), metadata: nested(p, "metadata"),
        amount_total: Number(p.get("line_items[0][price_data][unit_amount]")), currency: p.get("line_items[0][price_data][currency]"),
        success_url: p.get("success_url"), cancel_url: p.get("cancel_url"), expires_at: Number(p.get("expires_at")), payment_intent: null,
      } };
    }
    if (method === "POST" && path === "/v1/accounts") {
      return { status: 200, body: {
        id: id("acct"), object: "account", metadata: nested(p, "metadata"), charges_enabled: false, payouts_enabled: false, details_submitted: false,
        capabilities: { transfers: "inactive" }, requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: "requirements.past_due" },
      } };
    }
    if (method === "POST" && path === "/v1/account_links") {
      return { status: 200, body: { object: "account_link", url: `https://connect.stripe.com/setup/e/${p.get("account")}/${id("link")}`, expires_at: 0 } };
    }
    const login = /^\/v1\/accounts\/([^/]+)\/login_links$/.exec(path);
    if (method === "POST" && login) return { status: 200, body: { object: "login_link", url: `https://connect.stripe.com/express/${login[1]}/${id("ll")}` } };
    if (method === "GET" && path === "/v1/transfers") {
      return { status: 200, body: { object: "list", has_more: false, url: "/v1/transfers", data: transfers.filter((t) => t.transfer_group === query.get("transfer_group")) } };
    }
    if (method === "POST" && path === "/v1/transfers") {
      const t = { id: id("tr"), object: "transfer", amount: Number(p.get("amount")), amount_reversed: 0, currency: p.get("currency"), destination: p.get("destination"), transfer_group: p.get("transfer_group"), metadata: nested(p, "metadata") };
      transfers.push(t);
      return { status: 200, body: t };
    }
    if (method === "GET" && path === "/v1/refunds") {
      return { status: 200, body: { object: "list", has_more: false, url: "/v1/refunds", data: refunds.filter((r) => r.payment_intent === query.get("payment_intent")) } };
    }
    if (method === "POST" && path === "/v1/refunds") {
      const r = { id: id("re"), object: "refund", amount: Number(p.get("amount")), payment_intent: p.get("payment_intent"), status: "succeeded", metadata: nested(p, "metadata") };
      refunds.push(r);
      return { status: 200, body: r };
    }
    return { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: `Unrecognized request URL (${method}: ${path}).` } } };
  }

  const response = (status: number, body: Json): Stripe.HttpClientResponse => ({
    getStatusCode: () => status,
    getHeaders: () => ({ "request-id": `req_${tag}`, "stripe-should-retry": "false" }),
    getRawResponse: () => body,
    toStream: () => { throw new Error("not streamed"); },
    toJSON: async () => JSON.parse(JSON.stringify(body)),
  });

  const http: Stripe.HttpClient = {
    getClientName: () => "sponsorx-fake",
    makeRequest: async (_host, _port, fullPath, method, headers, requestData) => {
      const [path, qs] = fullPath.split("?") as [string, string | undefined];
      const h = headers as Record<string, string | undefined>;
      const isV2 = path.startsWith("/v2/");
      const req: SeenRequest = {
        method, path, query: new URLSearchParams(qs ?? ""), params: isV2 ? new URLSearchParams() : new URLSearchParams(requestData ?? ""),
        json: isV2 && requestData ? JSON.parse(requestData) as Record<string, unknown> : null,
        idempotencyKey: h["Idempotency-Key"] ?? h["idempotency-key"], authorization: h.Authorization ?? h.authorization,
      };
      seen.push(req);
      const f = failures.findIndex((x) => x.path === path);
      if (f >= 0) {
        const [failure] = failures.splice(f, 1);
        return response(failure!.status, { error: failure!.error });
      }
      const memo = method === "POST" && req.idempotencyKey ? `${path} ${req.idempotencyKey}` : null;
      if (memo && answered.has(memo)) {
        /* As Stripe: the same key with different parameters is refused. */
        if (sentWith.get(memo) !== (requestData ?? "")) {
          return response(400, { error: { type: "idempotency_error", message: `Keys for idempotent requests can only be used with the same parameters they were first used with (${req.idempotencyKey}).` } });
        }
        return response(200, answered.get(memo)!);
      }
      const a = answer(method, path, req.query, req.params, req.json);
      if (memo && a.status === 200) {
        answered.set(memo, a.body);
        sentWith.set(memo, requestData ?? "");
      }
      return response(a.status, a.body);
    },
  };

  return {
    http,
    seen,
    transfers,
    refunds,
    /** Set how a payee's account stands at "Stripe" (what GET /v2/core/accounts/:id answers). */
    setAccount: (acct: string, state: FakeAccountState) => accounts.set(acct, state),
    /** The requests to a path (and method). */
    to: (path: string, method = "POST") => seen.filter((r) => r.path === path && r.method === method),
    /** The next request to `path` answers with this Stripe error. */
    fail: (path: string, status: number, error: { type: string; code?: string; message: string }) => failures.push({ path, status, error }),
    reset: () => { seen.length = 0; },
  };
}

export type FakeStripe = ReturnType<typeof fakeStripe>;

/** A Stripe event body, as Stripe would POST it. */
export function stripeEvent(type: string, object: Json, opts: { id?: string; account?: string; created?: Date } = {}): string {
  return JSON.stringify({
    id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    object: "event",
    api_version: Stripe.API_VERSION,
    created: Math.floor((opts.created ?? new Date()).getTime() / 1000),
    type,
    livemode: false,
    pending_webhooks: 1,
    ...(opts.account ? { account: opts.account } : {}),
    data: { object },
  });
}

/** A thin (v2) event, as an event destination POSTs it: only what changed's id. */
export function thinEvent(type: string, relatedId: string, opts: { id?: string; created?: Date } = {}): string {
  return JSON.stringify({
    id: opts.id ?? `evt_test_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    object: "v2.core.event",
    type,
    created: (opts.created ?? new Date()).toISOString(),
    livemode: false,
    context: null,
    reason: null,
    related_object: { id: relatedId, type: "v2.core.account", url: `/v2/core/accounts/${relatedId}` },
  });
}

/** The `Stripe-Signature` header Stripe would send for this body — made by the SDK itself. */
export function stripeSignature(payload: string, secret: string, at = new Date()): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(at.getTime() / 1000) });
}
