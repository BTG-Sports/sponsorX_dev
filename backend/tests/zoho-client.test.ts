import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ZohoClient,
  ZohoRecordError,
  ZohoRetryableError,
  ZohoWrongOrgError,
  zohoConfigFromEnv,
} from "../src/lib/zoho";

/* --------------------------------------------------------------------------
   The Zoho client's own rules — P8-INT-01, field-mapping §3 and §8.2.
   -------------------------------------------------------------------------- */

type Call = { url: string; method: string; body: unknown };

function fakeFetch(respond: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) :
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { url, method: init?.method ?? "GET", body };
    calls.push(call);
    if (url.endsWith("/oauth/v2/token")) {
      return new Response(JSON.stringify({ access_token: "at_1", expires_in: 3600 }), { status: 200 });
    }
    const r = respond(call);
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  };
  return { calls, impl };
}

const config = {
  clientId: "c", clientSecret: "s", refreshToken: "r",
  apiDomain: "https://zoho.test", accountsUrl: "https://accounts.zoho.test",
};

const ok = (id = "77") => ({ json: { data: [{ status: "success", code: "SUCCESS", action: "insert", details: { id } }] } });

describe("upsert", () => {
  it("dedupes on SponsorX_ID and keeps the org's workflows out of it", async () => {
    const f = fakeFetch(() => ok());
    const out = await new ZohoClient(config, f.impl).upsert("Accounts", { SponsorX_ID: "s1", Account_Name: "A" });
    expect(out).toEqual({ id: "77", action: "insert" });
    const call = f.calls.find((c) => c.url.includes("/upsert"))!;
    expect(call.url).toBe("https://zoho.test/crm/v8/Accounts/upsert");
    expect(call.body).toEqual({
      data: [{ SponsorX_ID: "s1", Account_Name: "A" }],
      duplicate_check_fields: ["SponsorX_ID"],
      trigger: [],
    });
  });

  it("refuses to upsert a record with no SponsorX_ID — it would not dedupe", async () => {
    const f = fakeFetch(() => ok());
    await expect(new ZohoClient(config, f.impl).upsert("Accounts", { Account_Name: "A" })).rejects.toThrow(/would not dedupe/);
    expect(f.calls).toHaveLength(0);
  });
});

describe("Tasks — Zoho's upsert endpoint does not serve Activities", () => {
  /* Found against the live sandbox 2026-09-24: POST /Tasks/upsert answers
     INVALID_DATA "the given module is not supported for this api". */
  it("dedupes by hand on SponsorX_ID: inserts when absent", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/coql") ? { status: 204 } : ok("901")));
    const out = await new ZohoClient(config, f.impl).upsert("Tasks", { SponsorX_ID: "t'1", Subject: "Call" });
    expect(out).toEqual({ id: "901", action: "insert" });
    expect(f.calls.find((c) => c.url.endsWith("/coql"))!.body).toEqual({
      select_query: "select id from Tasks where SponsorX_ID = 't\\'1' limit 0, 2",
    });
    expect(f.calls.some((c) => c.url.includes("/upsert"))).toBe(false);
    expect(f.calls.at(-1)).toMatchObject({ method: "POST", url: "https://zoho.test/crm/v8/Tasks" });
  });

  it("updates the record already carrying the key instead of making a second", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/coql") ? { json: { data: [{ id: "901" }] } } : ok("901")));
    const out = await new ZohoClient(config, f.impl).upsert("Tasks", { SponsorX_ID: "t1", Subject: "Call", $se_module: "Deals" });
    expect(out.id).toBe("901");
    expect(f.calls.at(-1)).toMatchObject({ method: "PUT", url: "https://zoho.test/crm/v8/Tasks/901" });
  });
});

describe("what is retried and what is not", () => {
  it("treats throttling and outages as retryable", async () => {
    for (const status of [429, 500, 503]) {
      const f = fakeFetch(() => ({ status }));
      await expect(new ZohoClient(config, f.impl).get("Deals", "1")).rejects.toBeInstanceOf(ZohoRetryableError);
    }
  });

  it("treats a refused record as final", async () => {
    const f = fakeFetch(() => ({ json: { data: [{ status: "error", code: "MANDATORY_NOT_FOUND", details: { api_name: "Last_Name" } }] } }));
    await expect(new ZohoClient(config, f.impl).upsert("Contacts", { SponsorX_ID: "c1" })).rejects.toBeInstanceOf(ZohoRecordError);
  });

  it("refreshes once on a 401 and retries", async () => {
    let n = 0;
    const f = fakeFetch(() => (n++ === 0 ? { status: 401 } : { json: { data: [{ id: "1" }] } }));
    expect(await new ZohoClient(config, f.impl).get("Deals", "1")).toEqual({ id: "1" });
    expect(f.calls.filter((c) => c.url.endsWith("/oauth/v2/token"))).toHaveLength(2);
  });
});

describe("the org guard", () => {
  it("refuses to write when the token reaches a different org", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/crm/v8/org") ? { json: { org: [{ id: "749122837", type: "production" }] } } : ok()));
    const client = new ZohoClient({ ...config, expectedOrgId: "7554807000000020005" }, f.impl);
    await expect(client.upsert("Accounts", { SponsorX_ID: "s1" })).rejects.toBeInstanceOf(ZohoWrongOrgError);
    expect(f.calls.some((c) => c.url.includes("/upsert"))).toBe(false);
  });

  it("proceeds when it is the expected org, and checks only once", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/crm/v8/org") ? { json: { org: [{ id: "755", type: "sandbox" }] } } : ok()));
    const client = new ZohoClient({ ...config, expectedOrgId: "755" }, f.impl);
    await client.upsert("Accounts", { SponsorX_ID: "s1" });
    await client.upsert("Accounts", { SponsorX_ID: "s2" });
    expect(f.calls.filter((c) => c.url.endsWith("/crm/v8/org"))).toHaveLength(1);
  });
});

describe("configuration", () => {
  it("is absent, not half-built, without all three credentials", () => {
    expect(zohoConfigFromEnv({ ZOHO_CLIENT_ID: "c", ZOHO_CLIENT_SECRET: "s" })).toBeNull();
    expect(zohoConfigFromEnv({ ZOHO_CLIENT_ID: "c", ZOHO_CLIENT_SECRET: "s", ZOHO_REFRESH_TOKEN: "r" }))
      .toMatchObject({ apiDomain: "https://www.zohoapis.com", accountsUrl: "https://accounts.zoho.com" });
  });
});

describe("a worker without CRM credentials leaves CRM jobs waiting", async () => {
  const { dispatchableJobs, NEEDS_ZOHO_CRM } = await import("../worker/jobs/zoho-sync.mts");
  const handled = ["notify.email", "zoho.ingestInvoice", ...NEEDS_ZOHO_CRM];

  it("does not dispatch them — they would fail into pg-boss's archive and be lost", () => {
    const out = dispatchableJobs(handled, false);
    expect(out).toEqual(["notify.email", "zoho.ingestInvoice"]);
  });

  it("dispatches everything once credentials exist", () => {
    expect(dispatchableJobs(handled, true)).toEqual(handled);
  });

  it("covers every CRM job the worker handles", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    const block = worker.match(/HANDLED_JOBS = new Set<string>\(\[([\s\S]*?)\]\)/)![1]!;
    const zoho = [...block.matchAll(/"(zoho\.[^"]+)"/g)].map((m) => m[1]!).filter((n) => n !== "zoho.ingestInvoice");
    expect(zoho.sort()).toEqual([...NEEDS_ZOHO_CRM].sort());
  });
});
