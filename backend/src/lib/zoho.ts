/**
 * The Zoho CRM client — P8-INT-01, §18, field-mapping §8.2.
 *
 * WORKER ONLY. Nothing on a request path may import this file; the webhook
 * route and every API handler are pinned against it by
 * `tests/zoho-boundary.test.ts`. Zoho being slow or down must never be a
 * reason a sponsor's page does not load.
 *
 * Deliberately small: a token cache, one `request`, and the five calls the
 * sync actually makes. `fetch` is injected so every rule above it can be
 * tested against a fake org without the network.
 *
 * THE ORG GUARD. The same OAuth client serves the production org and the
 * `SponsorX-Dev` sandbox (credentials doc §7) — which org a token reaches is
 * decided by which refresh token was minted, and nothing in the token says
 * so. `ZOHO_EXPECTED_ORG_ID` makes it explicit: the first call reads `/org`
 * and refuses to write anything if the answer is a different org. A staging
 * worker holding a production token by mistake then fails its first job
 * instead of writing sample data into the real CRM.
 */

export type ZohoConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** e.g. https://www.zohoapis.com — the token exchange reports it. */
  apiDomain: string;
  /** e.g. https://accounts.zoho.com */
  accountsUrl: string;
  /** Refuse to operate against any other org. Strongly recommended. */
  expectedOrgId?: string;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** A record-level refusal from Zoho — bad data, not a bad moment. Retrying
 *  the same payload cannot succeed, so the job records it and stops. */
export class ZohoRecordError extends Error {
  readonly status = 422;
  constructor(
    readonly module: string,
    readonly code: string,
    readonly details: unknown,
  ) {
    super(`Zoho refused the ${module} record: ${code} ${JSON.stringify(details)}`);
    this.name = "ZohoRecordError";
  }
}

/** Throttled, unavailable, or a transient network fault. The queue retries. */
export class ZohoRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZohoRetryableError";
  }
}

export class ZohoNotConfiguredError extends Error {
  constructor() {
    super(
      "Zoho is not configured on this worker (ZOHO_CLIENT_ID / _SECRET / " +
        "_REFRESH_TOKEN). The job fails and retries rather than being dropped, " +
        "so the sync resumes the moment credentials are set.",
    );
    this.name = "ZohoNotConfiguredError";
  }
}

export class ZohoWrongOrgError extends Error {
  constructor(expected: string, actual: string, type: string) {
    super(
      `This Zoho token reaches org ${actual} (${type}), but ZOHO_EXPECTED_ORG_ID ` +
        `is ${expected}. Refusing to read or write anything.`,
    );
    this.name = "ZohoWrongOrgError";
  }
}

export type ZohoRecord = Record<string, unknown> & { id?: string };

/** Modules the upsert endpoint refuses — Zoho's Activities. */
const UPSERT_UNSUPPORTED = new Set(["Tasks", "Events", "Calls"]);

export type ZohoUser = { id: string; email: string; status?: string };

export function zohoConfigFromEnv(
  e: Record<string, string | undefined> = process.env,
): ZohoConfig | null {
  if (!e.ZOHO_CLIENT_ID || !e.ZOHO_CLIENT_SECRET || !e.ZOHO_REFRESH_TOKEN) return null;
  return {
    clientId: e.ZOHO_CLIENT_ID,
    clientSecret: e.ZOHO_CLIENT_SECRET,
    refreshToken: e.ZOHO_REFRESH_TOKEN,
    apiDomain: e.ZOHO_API_DOMAIN ?? "https://www.zohoapis.com",
    accountsUrl: e.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com",
    expectedOrgId: e.ZOHO_EXPECTED_ORG_ID || undefined,
  };
}

export class ZohoClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private orgChecked = false;

  constructor(
    private readonly config: ZohoConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
    });
    const res = await this.fetchImpl(`${this.config.accountsUrl}/oauth/v2/token`, {
      method: "POST",
      body,
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!json.access_token) {
      throw new ZohoRetryableError(`Zoho token refresh failed: ${json.error ?? res.status}`);
    }
    this.accessToken = json.access_token;
    /* A minute of margin: a token that expires mid-request fails the request,
       and refreshing slightly early costs one call an hour. */
    this.expiresAt = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken;
  }

  private async assertOrg(): Promise<void> {
    if (this.orgChecked || !this.config.expectedOrgId) return;
    const json = (await this.raw("GET", "/crm/v8/org")) as {
      org?: { id: string; type?: string }[];
    };
    const org = json.org?.[0];
    if (!org || org.id !== this.config.expectedOrgId) {
      throw new ZohoWrongOrgError(this.config.expectedOrgId, org?.id ?? "?", org?.type ?? "?");
    }
    this.orgChecked = true;
  }

  private async raw(method: string, path: string, body?: unknown): Promise<unknown> {
    const send = async () =>
      this.fetchImpl(`${this.config.apiDomain}${path}`, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${await this.token()}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    let res = await send();
    if (res.status === 401) {
      /* Revoked or expired early. One fresh token, one retry — a second 401
         is a credential problem the queue's backoff will not fix quickly. */
      this.accessToken = null;
      res = await send();
    }
    if (res.status === 204) return {};
    if (res.status === 429 || res.status >= 500) {
      throw new ZohoRetryableError(`Zoho ${method} ${path} answered ${res.status}`);
    }
    const json = await res.json().catch(() => ({}));
    if (res.status >= 400) {
      const j = json as { code?: string; details?: unknown; data?: unknown[] };
      const first = (j.data?.[0] ?? j) as { code?: string; message?: string; details?: unknown };
      throw new ZohoRecordError(path, first.code ?? String(res.status), { message: first.message, ...(first.details as object ?? {}) });
    }
    return json;
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    await this.assertOrg();
    return this.raw(method, path, body);
  }

  /**
   * Create-or-update on `SponsorX_ID` — the dedupe key (field-mapping §3).
   * A retried job updates the record the first attempt created instead of
   * making a second one. `trigger: []` keeps the org's own workflows from
   * firing on our writes (field-mapping §5.3).
   */
  async upsert(module: string, record: ZohoRecord): Promise<{ id: string; action: string }> {
    if (!record.SponsorX_ID) {
      throw new Error(`upsert to ${module} without SponsorX_ID would not dedupe`);
    }
    if (UPSERT_UNSUPPORTED.has(module)) return this.findThenWrite(module, record);
    const json = (await this.request("POST", `/crm/v8/${module}/upsert`, {
      data: [record],
      duplicate_check_fields: ["SponsorX_ID"],
      trigger: [],
    })) as { data?: { status: string; code: string; action?: string; details: { id?: string } }[] };
    return this.firstResult(module, json);
  }

  /**
   * The same contract as `upsert` for a module Zoho's upsert endpoint does
   * not serve. Verified against the live org 2026-09-24: `POST /Tasks/upsert`
   * answers INVALID_DATA "the given module is not supported for this api" —
   * Tasks are Activities. So the dedupe is done by hand, on the same key: find
   * the record carrying this SponsorX_ID, update it if found, insert if not.
   */
  private async findThenWrite(module: string, record: ZohoRecord): Promise<{ id: string; action: string }> {
    const key = String(record.SponsorX_ID).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const { rows } = await this.coql(`select id from ${module} where SponsorX_ID = '${key}' limit 0, 2`);
    if (rows[0]?.id) {
      const { $se_module: _m, ...rest } = record;
      return this.update(module, String(rows[0].id), rest);
    }
    const json = (await this.request("POST", `/crm/v8/${module}`, {
      data: [record],
      trigger: [],
    })) as { data?: { status: string; code: string; action?: string; details: { id?: string } }[] };
    const out = this.firstResult(module, json);
    return { id: out.id, action: "insert" };
  }

  /** Update a record whose Zoho id we already hold. */
  async update(module: string, id: string, record: ZohoRecord): Promise<{ id: string; action: string }> {
    const json = (await this.request("PUT", `/crm/v8/${module}/${id}`, {
      data: [record],
      trigger: [],
    })) as { data?: { status: string; code: string; action?: string; details: { id?: string } }[] };
    return this.firstResult(module, json);
  }

  private firstResult(
    module: string,
    json: { data?: { status: string; code: string; action?: string; details: { id?: string } }[] },
  ): { id: string; action: string } {
    const r = json.data?.[0];
    if (!r || r.status !== "success" || !r.details?.id) {
      throw new ZohoRecordError(module, r?.code ?? "NO_RESULT", r?.details ?? json);
    }
    return { id: String(r.details.id), action: r.action ?? "update" };
  }

  /** One record, or null if Zoho no longer has it. */
  async get(module: string, id: string): Promise<ZohoRecord | null> {
    const json = (await this.request("GET", `/crm/v8/${module}/${id}`)) as { data?: ZohoRecord[] };
    return json.data?.[0] ?? null;
  }

  /** A COQL page. Zoho caps a page at 2,000; callers page with LIMIT/OFFSET. */
  async coql(query: string): Promise<{ rows: ZohoRecord[]; more: boolean }> {
    const json = (await this.request("POST", "/crm/v8/coql", { select_query: query })) as {
      data?: ZohoRecord[];
      info?: { more_records?: boolean };
    };
    return { rows: json.data ?? [], more: Boolean(json.info?.more_records) };
  }

  /** A page of a module, for the backfill. */
  async list(
    module: string,
    fields: readonly string[],
    page: number,
    perPage = 200,
  ): Promise<{ rows: ZohoRecord[]; more: boolean }> {
    const json = (await this.request(
      "GET",
      `/crm/v8/${module}?fields=${fields.join(",")}&page=${page}&per_page=${perPage}&sort_by=id&sort_order=asc`,
    )) as { data?: ZohoRecord[]; info?: { more_records?: boolean } };
    return { rows: json.data ?? [], more: Boolean(json.info?.more_records) };
  }

  async activeUsers(): Promise<ZohoUser[]> {
    const json = (await this.request("GET", "/crm/v8/users?type=ActiveUsers")) as {
      users?: ZohoUser[];
    };
    return json.users ?? [];
  }

  /** Subscribe (or renew) a Notifications API channel — the inbound half. */
  async watch(channel: {
    channelId: string;
    events: readonly string[];
    notifyUrl: string;
    token: string;
    expiry: Date;
  }): Promise<unknown> {
    return this.request("POST", "/crm/v8/actions/watch", {
      watch: [
        {
          channel_id: channel.channelId,
          events: channel.events,
          notify_url: channel.notifyUrl,
          token: channel.token,
          channel_expiry: channel.expiry.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
        },
      ],
    });
  }
}

let shared: ZohoClient | null = null;

/** The worker's client, or a thrown ZohoNotConfiguredError. */
export function zohoFromEnv(): ZohoClient {
  const config = zohoConfigFromEnv();
  if (!config) throw new ZohoNotConfiguredError();
  shared ??= new ZohoClient(config);
  return shared;
}
