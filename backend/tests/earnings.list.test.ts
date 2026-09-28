import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /earnings — P7-FE-01 (athlete) / P7-FE-02 (Finance).
   Pinned: status only (no bank/tax keys exist to leak); the athlete gets
   their own amounts but never the sponsor price or the commission; a role
   §7.1 denies `earning.amount` gets no money at all; Finance gets the
   reconciliation against the Zoho invoice mirror, void invoices excluded.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: unknown[] = [];
let invoices: unknown[] = [];
let invArgs: Record<string, unknown> | null = null;
vi.mock("../src/db/client", () => ({
  prisma: {
    earning: { findMany: () => Promise.resolve(rows) },
    campaignInvoice: { findMany: (a: Record<string, unknown>) => ((invArgs = a), Promise.resolve(invoices)) },
  },
}));

const { listEarnings } = await import("../src/routes/v1/earnings");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null, sponsorId: null };
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "a1" } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"], athleteId: null } as unknown as Actor;
const campaignMgr = { ...base, roles: ["CAMPAIGN_MGR"], athleteId: null } as unknown as Actor;
const admin = { ...base, roles: ["BTG_ADMIN"], athleteId: null } as unknown as Actor;

function earning(over: Record<string, unknown> = {}) {
  return {
    id: "e1", state: "PAID", gross: 40_000, adjustment: -1_000, taxYear: 2026,
    paidAt: new Date("2026-10-20T00:00:00Z"), reference: "PAY-001",
    athlete: { id: "a1", displayName: "JORDAN" },
    order: {
      id: "o1", jobId: "SX-01", acceptedAt: new Date("2026-10-01T00:00:00Z"), sellPrice: 60_000,
      job: { name: "Story Drop" },
      campaign: { id: "c1", name: "Fall", sponsor: { name: "Bowie" } },
      deliverables: [{ state: "VERIFIED" }, { state: "PUBLISHED" }],
    },
    ...over,
  };
}

async function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  await listEarnings({ actor, query: {} } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return body!;
}

beforeEach(() => {
  rows = [earning(), earning({ id: "e2", state: "PENDING", gross: 20_000, adjustment: 0, paidAt: null, reference: null })];
  invoices = [
    { campaignId: "c1", number: "INV-1", status: "paid", amount: 50_000, paidAt: new Date("2026-10-10T00:00:00Z"), zohoInvoiceId: "z1", issuedAt: null, dueAt: null },
    { campaignId: "c1", number: "INV-2", status: "sent", amount: 30_000, paidAt: null, zohoInvoiceId: "z2", issuedAt: null, dueAt: new Date("2026-10-15T00:00:00Z") },
    { campaignId: "c1", number: "INV-3", status: "void", amount: 99_000, paidAt: null, zohoInvoiceId: "z3", issuedAt: null, dueAt: null },
  ];
  invArgs = null;
});

describe("GET /earnings", () => {
  it("gives the athlete their own net amount — never the sponsor price or commission", async () => {
    const b = await call(athlete);
    const e = (b.earnings as Record<string, unknown>[])[0];
    expect(e.amount).toBe(39_000);
    expect("sellPrice" in e).toBe(false);
    expect("commission" in e).toBe(false);
    expect(b.campaigns).toBeUndefined();
    expect(invArgs).toBeNull();
  });

  it("carries no bank or tax field at all", async () => {
    expect(JSON.stringify(await call(finance))).not.toMatch(/bank|routing|iban|taxId|ssn|tin/i);
  });

  it("a role §7.1 denies earning.amount gets no money", async () => {
    const e = ((await call(campaignMgr)).earnings as Record<string, unknown>[])[0];
    for (const k of ["amount", "gross", "adjustment", "sellPrice", "commission"]) expect(k in e).toBe(false);
  });

  it("FINANCE gets commission but no invoices — the 2026-09-24 matrix decision", async () => {
    const b = await call(finance);
    expect(((b.earnings as Record<string, unknown>[])[0]).commission).toBe(21_000);
    expect(b.campaigns).toBeUndefined();
  });

  it("BTG admin gets the reconciliation, void invoices excluded", async () => {
    const b = await call(admin);
    const e = (b.earnings as Record<string, unknown>[])[0];
    expect(e.commission).toBe(21_000);
    expect(b.campaigns).toEqual([{
      campaignId: "c1", name: "Fall", sponsorName: "Bowie",
      contracted: 120_000, invoiced: 80_000, invoicePaid: 50_000,
      earningsRaised: 59_000, earningsPaid: 39_000,
      invoices: [
        { number: "INV-1", zohoInvoiceId: "z1", status: "paid", amount: 50_000, paidAt: "2026-10-10T00:00:00.000Z", issuedAt: null, dueAt: null },
        { number: "INV-2", zohoInvoiceId: "z2", status: "sent", amount: 30_000, paidAt: null, issuedAt: null, dueAt: "2026-10-15T00:00:00.000Z" },
        { number: "INV-3", zohoInvoiceId: "z3", status: "void", amount: 99_000, paidAt: null, issuedAt: null, dueAt: null },
      ],
    }]);
  });

  it("counts verified deliverables on each order", async () => {
    const e = ((await call(athlete)).earnings as Record<string, { deliverables: unknown }>[])[0];
    expect(e.order.deliverables).toEqual({ verified: 1, total: 2 });
  });
});
