import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeStripe, stripeEvent, stripeSignature } from "./support/fake-stripe";

/* --------------------------------------------------------------------------
   2S0-SEC-01 · Payments and PII security review — the checks, pinned.
   documentation/SponsorX-Payments-PII-Review-2026-10.md has the findings;
   each block here is named after the check it proves.

     1. card data never touches our servers;
     2. payout account data stays at the provider;
     3. verification documents are in private storage;
     4. personal data is masked in logs.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ppii-test.invalid` } : null;
  },
}));

const root = join(import.meta.dirname, "..");
const repo = join(root, "..");

function walk(dir: string, keep: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, keep));
    else if (keep(p)) out.push(p);
  }
  return out;
}
const code = (f: string) => /\.(ts|tsx|mts)$/.test(f) && !/\.test\.(ts|tsx|mts)$/.test(f);

/* What a sponsor's card payment carries at Stripe, none of which SponsorX may keep. */
const SPONSOR = {
  email: "dana.payer@harbor-coffee.example",
  name: "Dana Q. Payer",
  phone: "+13015550142",
  line1: "742 Evergreen Terrace",
  postal: "20814",
  last4: "4242",
  fingerprint: "Xt5EWLLDS7FJjR1c",
};
const PII_STRINGS = [SPONSOR.email, SPONSOR.name, SPONSOR.phone, SPONSOR.line1, SPONSOR.postal, SPONSOR.fingerprint, '"last4"', '"exp_month"', '"brand"'];
const leaks = (text: string) => PII_STRINGS.filter((s) => text.includes(s));

const customerDetails = {
  email: SPONSOR.email, name: SPONSOR.name, phone: SPONSOR.phone,
  address: { line1: SPONSOR.line1, line2: null, city: "Bethesda", state: "MD", postal_code: SPONSOR.postal, country: "US" }, tax_exempt: "none", tax_ids: [],
};
const cardDetails = {
  type: "card",
  card: { brand: "visa", last4: SPONSOR.last4, exp_month: 12, exp_year: 2030, country: "US", funding: "credit", fingerprint: SPONSOR.fingerprint, checks: { cvc_check: "pass" } },
};

/* ── 1 · card data ───────────────────────────────────────────────────────── */

describe("1 · card data never touches our servers (static)", () => {
  it("no card-number, CVC or expiry field exists in the API, the worker, the web app or the schema", () => {
    const files = [
      ...walk(join(root, "src"), code), ...walk(join(root, "worker"), code), ...walk(join(repo, "frontend", "src"), code),
      join(root, "prisma", "schema.prisma"),
    ];
    expect(files.length).toBeGreaterThan(300);
    const CARD_FIELD = /\b(card_?number|cardNumber|cvc|cvv|cvc2|exp_month|exp_year|expMonth|expYear|cardExpir\w*|cc-number|cc-csc|cc-exp|security_?code)\b/i;
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        /* The two Luhn guards that REFUSE a card number typed into a reference box are the exception. */
        if (CARD_FIELD.test(line) && !/looksLikeCardNumber|readonly code = "card_number"/.test(line)) hits.push(`${f.slice(repo.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("the stand-in's checkout page takes no card details: its only inputs are the signed token and the test outcome", () => {
    const page = readFileSync(join(repo, "frontend/src/app/test-provider/checkout/page.tsx"), "utf8");
    const inputs = [...page.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
    expect(inputs).toEqual(['<input type="hidden" name="token" value={token} />']);
    expect(page).not.toMatch(/autoComplete="cc-/);
  });
});

/* ── 2 · payout account data ─────────────────────────────────────────────── */

describe("2 · payout account data stays at the provider (static)", () => {
  it("no column anywhere in the schema is shaped like a bank, card, tax or identity number", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    const fields: string[] = [];
    let model = "";
    for (const line of schema.split("\n")) {
      const m = /^model (\w+) \{/.exec(line);
      if (m) model = m[1]!;
      else if (/^\}/.test(line)) model = "";
      else if (model) {
        const f = /^\s+(\w+)\s+\w/.exec(line);
        if (f && !line.trim().startsWith("//") && !line.trim().startsWith("@@")) fields.push(`${model}.${f[1]}`);
      }
    }
    expect(fields.length).toBeGreaterThan(1000);
    /* By camelCase word, so `listingId` is not a "tin" nor `expansion` a "pan". */
    const WORD = new Set(["iban", "routing", "swift", "bic", "ssn", "ein", "tin", "itin", "vat", "passport", "cvc", "cvv", "pan"]);
    const PAIR = ["account number", "bank account", "sort code", "tax id", "social security", "card number", "drivers license", "driver license", "license number", "id number"];
    const suspect = (f: string) => {
      const words = f.split(".")[1]!.split(/(?=[A-Z])|_/).map((w) => w.toLowerCase());
      const text = words.join(" ");
      return words.some((w) => WORD.has(w)) || PAIR.some((p) => text.includes(p));
    };
    expect(fields.filter(suspect)).toEqual([]);
    /* The check bites: these would be refused. */
    expect(["Athlete.taxId", "PayoutAccount.routingNumber", "Payee.bankAccountLast4", "Guardian.ssnLast4", "Sponsor.cardNumber"].filter(suspect)).toHaveLength(5);
  });
});

/* ── 4 · logs ────────────────────────────────────────────────────────────── */

describe("4 · personal data is masked in logs and provider errors", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => spy.mockClear());
  afterAll(() => spy.mockRestore());

  it("logError masks every address, in a message or deep in an error object (a Postgres unique violation names the value)", async () => {
    const { logError } = await import("../src/lib/redact");
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "User_email_key"'), {
      code: "23505", detail: `Key (email)=(${SPONSOR.email}) already exists.`,
    });
    logError(`[worker] mail to ${SPONSOR.email} failed:`, pgError);
    const printed = spy.mock.calls.flat().join("\n");
    expect(printed).toContain("…@harbor-coffee.example");
    expect(printed).toContain("23505");
    expect(printed).not.toContain(SPONSOR.email);
  });

  it("a Stripe refusal is scrubbed of addresses as well as keys before it is logged or kept", async () => {
    const stripe = await import("../src/lib/stripe");
    const failure = stripe.classifyStripeError({ type: "StripeInvalidRequestError", code: "email_invalid", message: `Invalid email address: ${SPONSOR.email} (key sk_live_${"a".repeat(24)})` });
    expect(failure).toMatchObject({ kind: "refused", code: "email_invalid" });
    expect(failure.message).toBe("Invalid email address: …@harbor-coffee.example (key sk_live_[redacted])");
  });

  it("no console.error / warn / info / debug in the API or the worker outside the redacting helper; console.log only on known lines", () => {
    const files = [...walk(join(root, "src"), code), ...walk(join(root, "worker"), code)];
    expect(files.length).toBeGreaterThan(150);
    const LOG_ALLOWED = new Set(["src/index.ts", "src/combined.mts", "worker/index.mts", "worker/jobs/seed-personas.mts"]);
    const bad: string[] = [];
    for (const f of files) {
      const rel = f.slice(root.length + 1);
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/console\.(error|warn|info|debug|trace)\(/.test(line) && rel !== "src/lib/redact.ts") bad.push(`${rel}:${i + 1}`);
        if (/console\.log\(/.test(line) && !LOG_ALLOWED.has(rel)) bad.push(`${rel}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
    /* The one console.error is the redacting one. */
    expect(readFileSync(join(root, "src/lib/redact.ts"), "utf8")).toMatch(/console\.error\(\.\.\.parts\.map\(redactForLog\)\)/);
    /* And the API's 5xx handler — where every unexpected error lands — uses it. */
    expect(readFileSync(join(root, "src/app.ts"), "utf8")).toMatch(/if \(status >= 500\) logError\(`\[error \$\{reference\}\]`, err\);/);
  });
});

/* ── 3 · verification documents: the bucket separation ─────────────────── */

describe("3 · verification documents stay private (static)", () => {
  const src = walk(join(root, "src"), code).concat(walk(join(root, "worker"), code));
  const read = (f: string) => readFileSync(f, "utf8");
  const rel = (f: string) => f.slice(root.length + 1);

  it("the public bucket is reached from one place only: the branding logo", () => {
    const users = src.filter((f) => /presignPublicUpload\(|publicObjectUrl\(|BUCKETS\.public\b/.test(read(f))).map(rel).sort();
    expect(users).toEqual(["src/domain/branding.ts", "src/lib/storage.ts"]);
  });

  it("every identity, guardianship, organisation and proof document is read through a five-minute signed link", () => {
    const docs = ["onboarding-documents", "athlete-profile-change", "sponsor-requests", "signups-desk", "guardian-handoff", "delivery", "support"];
    for (const d of docs) {
      const text = read(join(root, "src/domain", `${d}.ts`));
      const grants = [...text.matchAll(/presignPrivateDownload\([^;]*;/g)].map((m) => m[0]);
      expect(grants.length, d).toBeGreaterThan(0);
      for (const g of grants) expect(g, d).toMatch(/SENSITIVE_DOCUMENT_TTL_SECONDS\)/);
    }
    expect(read(join(root, "src/lib/storage.ts"))).toMatch(/export const SENSITIVE_DOCUMENT_TTL_SECONDS = 5 \* 60;/);
    /* The upload-only flows hand out no download link at all. */
    for (const d of ["account-documents", "organization-documents"]) expect(read(join(root, "src/domain", `${d}.ts`)), d).not.toMatch(/presignPrivateDownload|presignPublicUpload/);
  });

  it("O1 · no email carries a private-bucket file: the queue can't name one and the sender can't read one", () => {
    expect(read(join(root, "src/lib/email.ts"))).not.toMatch(/^\s*attachments\?:/m);
    const sender = read(join(root, "worker/jobs/send-email.mts"));
    expect(sender).not.toMatch(/getPrivateObject|loadAttachment|AttachmentLoader|\battachments\b\s*[:?]?\s*[[{(]|\.\.\.\(attachments/);
    expect(read(join(root, "worker/index.mts"))).toMatch(/handleSendEmail\(pool, job\.data\);/);
    expect(read(join(root, "src/domain/support.ts"))).not.toMatch(/attachments: files\.map\(\(f\) => \(\{ filename: f\.filename, key/);
  });
});

describe("3 · verification documents stay private: the API refuses to boot with the buckets crossed", () => {
  const BASE = { ...process.env };
  const boot = async (vars: Record<string, string>) => {
    process.env = { ...BASE, DATABASE_URL: BASE.DATABASE_URL ?? "postgresql://sponsorx@127.0.0.1:55432/none", ...vars };
    vi.resetModules();
    return import("../src/config/env");
  };
  afterEach(() => {
    process.env = { ...BASE };
    vi.resetModules();
  });

  it("one bucket named as both public and private is refused", async () => {
    await expect(boot({ S3_BUCKET_PUBLIC: "sponsorx-docs", S3_BUCKET_PRIVATE: "SponsorX-Docs " })).rejects.toThrow(/name the same bucket/);
  });
  it("a public CDN address that serves the private bucket is refused, path style or host style", async () => {
    await expect(boot({ S3_BUCKET_PRIVATE: "sx-private", R2_PUBLIC_BASE_URL: "https://files.example.com/sx-private" })).rejects.toThrow(/R2_PUBLIC_BASE_URL points at the private bucket/);
    await expect(boot({ S3_BUCKET_PRIVATE: "sx-private", R2_PUBLIC_BASE_URL: "https://sx-private.abc123.r2.cloudflarestorage.com" })).rejects.toThrow(/private bucket/);
  });
  it("the real shapes boot: MinIO path style locally, an r2.dev or custom domain in production", async () => {
    await expect(boot({ S3_BUCKET_PUBLIC: "sponsorx-public", S3_BUCKET_PRIVATE: "sponsorx-private", R2_PUBLIC_BASE_URL: "http://localhost:9000/sponsorx-public" })).resolves.toBeTruthy();
    await expect(boot({ S3_BUCKET_PUBLIC: "sponsorx-public", S3_BUCKET_PRIVATE: "sponsorx-private", R2_PUBLIC_BASE_URL: "https://pub-0123456789abcdef.r2.dev" })).resolves.toBeTruthy();
    await expect(boot({ S3_BUCKET_PUBLIC: "cdn", S3_BUCKET_PRIVATE: "sponsorx", R2_PUBLIC_BASE_URL: "https://cdn.sponsorx.net" })).resolves.toBeTruthy();
  });
});

/* ── end to end, against the real API and database ────────────────────── */

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "ppii_btg";
const OTHER_T = "ppii_other_btg";
const SECRET = "whsec_ppii_platform";
const CONNECT_SECRET = "whsec_ppii_connect";

describe.skipIf(!hasDatabase)("2S0-SEC-01 · what SponsorX keeps of a Stripe payment, a dispute and a payout account", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "ppii", domain: "ppii-test.invalid" });
  const { prisma, events } = w;
  const { useStripeHttpClient } = await import("../src/lib/stripe");
  const fake = fakeStripe("ppii");
  let n = 0;
  const uniq = (p: string) => `${p}_ppii${++n}${Date.now().toString(36)}`;

  beforeAll(async () => {
    await w.setup();
    w.setEnv("PAYMENT_PROVIDER", "stripe");
    w.setEnv("STRIPE_SECRET_KEY", "sk_test_x");
    w.setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    w.setEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT_SECRET);
    w.setEnv("APP_URL", "https://app.ppii.test");
    useStripeHttpClient(fake.http);
  });
  afterAll(async () => {
    useStripeHttpClient(null);
    /* Refused deliveries have no tenant; this file's are found by their event ids. */
    await prisma.$executeRawUnsafe(`DELETE FROM "WebhookDelivery" WHERE "source" LIKE 'payments:%' AND "payload"->>'id' LIKE 'evt_ppii%'`);
    await w.teardown();
  });

  const post = (raw: string, secret = SECRET) => w.deliver(raw, { provider: "stripe", signature: stripeSignature(raw, secret) });
  const storedPayload = async (eventId: string) =>
    (await prisma.paymentEvent.findUniqueOrThrow({ where: { id: eventId }, select: { payload: true } })).payload as Record<string, unknown>;

  async function checkoutCompleted() {
    const orderId = await w.freshOrder();
    const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
    expect(pay.status, pay.text).toBe(200);
    const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true, amountCents: true } });
    const pi = uniq("pi");
    const raw = stripeEvent("checkout.session.completed", {
      id: uniq("cs_test"), object: "checkout.session", mode: "payment", payment_status: "paid", status: "complete",
      payment_intent: { id: pi, object: "payment_intent", payment_method: { id: "pm_x", billing_details: { ...customerDetails }, card: cardDetails.card }, latest_charge: { id: "ch_x", payment_method_details: cardDetails, billing_details: customerDetails } },
      amount_total: a.amountCents, currency: "usd", client_reference_id: a.id, metadata: { attemptId: a.id, orderId },
      customer_details: customerDetails, customer_email: SPONSOR.email, shipping_details: { name: SPONSOR.name, address: customerDetails.address },
      payment_method_details: cardDetails,
    }, { id: uniq("evt_ppii") });
    expect(leaks(raw).length, "the fixture carries everything Stripe would").toBe(PII_STRINGS.length);
    return { orderId, attemptId: a.id, pi, raw };
  }

  it("1 · a paid Checkout Session full of the sponsor's details is kept as ids and an amount — the order is still paid", async () => {
    const c = await checkoutCompleted();
    const r = await post(c.raw);
    expect(r.status, r.text).toBe(202);
    const eventId = r.json.events[0].id as string;
    expect(await events.processPaymentEvent(eventId)).toMatchObject({ status: "APPLIED" });
    expect(await w.orderState(c.orderId)).toBe("PAID");
    const payload = await storedPayload(eventId);
    expect(Object.keys(payload).sort()).toEqual(["amountCents", "attemptId", "paymentRef"]);
    expect(payload).toMatchObject({ attemptId: c.attemptId, paymentRef: c.pi });
    /* Nowhere else in the books either: not the event row, its audit, its job or the receipt's job. */
    const event = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: eventId }, select: { payload: true, subjectRef: true, outcome: true, resolutionNote: true } });
    expect(leaks(JSON.stringify(event))).toEqual([]);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: { in: [T, w.E.tenant] } }, select: { action: true, before: true, after: true } });
    expect(leaks(JSON.stringify(audits))).toEqual([]);
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: { in: [T, w.E.tenant] } }, select: { payload: true } });
    expect(leaks(JSON.stringify(jobs))).toEqual([]);
    /* The provider event id stays unique: the same delivery again is one event. */
    const again = await post(c.raw);
    expect(again.json.events[0]).toMatchObject({ id: eventId, duplicate: true });
  });

  it("1 · a dispute's evidence (the sponsor's name, email, billing address) is not kept: ids, the amount and the reason", async () => {
    const c = await checkoutCompleted();
    const applied = await post(c.raw);
    await events.processPaymentEvent(applied.json.events[0].id);
    const raw = stripeEvent("charge.dispute.created", {
      id: uniq("dp"), object: "dispute", amount: 5000, currency: "usd", payment_intent: c.pi, charge: "ch_x", reason: "fraudulent", status: "needs_response",
      evidence: { customer_name: SPONSOR.name, customer_email_address: SPONSOR.email, billing_address: SPONSOR.line1, customer_purchase_ip: "203.0.113.9" },
      payment_method_details: cardDetails,
    }, { id: uniq("evt_ppii") });
    const r = await post(raw);
    expect(r.status, r.text).toBe(202);
    const payload = await storedPayload(r.json.events[0].id);
    expect(Object.keys(payload).sort()).toEqual(["amountCents", "disputeRef", "paymentRef", "reason"]);
    expect(leaks(JSON.stringify(payload))).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("203.0.113.9");
  });

  it("2 · an account.updated carrying the payee's identity and bank details keeps the account id and its readiness only", async () => {
    const acct = uniq("acct");
    const raw = stripeEvent("account.updated", {
      id: acct, object: "account", payouts_enabled: false, details_submitted: true, capabilities: { transfers: "pending" },
      requirements: { currently_due: ["individual.verification.document"], past_due: [], disabled_reason: null },
      email: SPONSOR.email,
      individual: { first_name: "Riley", last_name: "Carter", dob: { day: 9, month: 3, year: 2007 }, ssn_last_4_provided: true, id_number_provided: true, phone: SPONSOR.phone, address: customerDetails.address },
      external_accounts: { data: [{ id: "ba_x", object: "bank_account", last4: "6789", routing_number: "110000000", bank_name: "STRIPE TEST BANK", fingerprint: SPONSOR.fingerprint }] },
    }, { id: uniq("evt_ppii"), account: acct });
    const r = await post(raw, CONNECT_SECRET);
    expect(r.status, r.text).toBe(202);
    const payload = await storedPayload(r.json.events[0].id);
    expect(Object.keys(payload).sort()).toEqual(["accountRef", "reason", "status"]);
    expect(payload).toMatchObject({ accountRef: acct, status: "NEEDS_INFO" });
    for (const s of [...PII_STRINGS, "110000000", "6789", "2007", "Riley", "dob"]) expect(JSON.stringify(payload)).not.toContain(s);
  });

  it("1 · a REFUSED delivery of that same event keeps which event it was, not what it carried", async () => {
    const c = await checkoutCompleted();
    const eventId = JSON.parse(c.raw).id as string;
    /* Signed with a secret SponsorX doesn't hold — as after a rotation done wrong. */
    expect((await post(c.raw, "whsec_ppii_wrong")).status).toBe(401);
    /* Stripe not connected here: the endpoint switched on at Stripe before PAYMENT_PROVIDER was. */
    w.setEnv("PAYMENT_PROVIDER", "none");
    try {
      expect((await post(c.raw)).status).toBe(404);
    } finally {
      w.setEnv("PAYMENT_PROVIDER", "stripe");
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ payload: Record<string, unknown>; error: string; status: string }>>(
      `SELECT payload, error, status FROM "WebhookDelivery" WHERE "source" = 'payments:stripe' AND "payload"->>'id' = $1 ORDER BY "receivedAt"`, eventId,
    );
    expect(rows.map((r) => r.status)).toEqual(["REJECTED", "REJECTED"]);
    expect(rows[0]!.error).toMatch(/did not verify/);
    for (const row of rows) {
      expect(row.payload).toMatchObject({ id: eventId, object: "event", type: "checkout.session.completed", subjectObject: "checkout.session", livemode: false });
      expect(Object.keys(row.payload).sort()).toEqual(["bytes", "created", "id", "livemode", "object", "subjectId", "subjectObject", "type"]);
      expect(leaks(JSON.stringify(row.payload))).toEqual([]);
    }
    /* Nothing was recorded as an event. */
    expect(await prisma.paymentEvent.count({ where: { providerEventId: eventId } })).toBe(0);
  });

  it("1 · a refused body that isn't JSON is kept as its size only", async () => {
    const { rejectedDeliveryRecord } = await import("../src/domain/payment-events");
    const broken = `{"customer_email":"${SPONSOR.email}"`;
    expect(rejectedDeliveryRecord(broken)).toEqual({ unparseable: true, bytes: broken.length });
    const list = JSON.stringify([SPONSOR.email]);
    expect(rejectedDeliveryRecord(list)).toEqual({ bytes: list.length });
  });

  it("2 · GET /payouts/account answers status only — never the provider's account id — and the onboarding link is stored nowhere", async () => {
    const mgr = w.id("mgr");
    fake.reset();
    const link = await w.call("POST", "/payouts/account/link", mgr, { returnPath: "/property/earnings" });
    expect(link.status, link.text).toBe(200);
    const url = link.json.url as string;
    expect(url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    const row = await prisma.payoutAccount.findUniqueOrThrow({ where: { payeeType_payeeId: { payeeType: "PROPERTY", payeeId: w.E.property } }, select: { providerAccountId: true } });
    const view = await w.call("GET", "/payouts/account", mgr);
    expect(view.status).toBe(200);
    expect(Object.keys(view.json).sort()).toEqual(["canSetUp", "provider", "status", "testProvider", "updatedAt"]);
    expect(view.text).not.toContain(row.providerAccountId!);
    /* Riley's (the stand-in's) too. */
    const riley = await w.call("GET", "/payouts/account", w.id("riley"));
    expect(Object.keys(riley.json).sort()).toEqual(["canSetUp", "provider", "status", "testProvider", "updatedAt"]);
    expect(riley.text).not.toMatch(/acct_|standin_acct/);
    /* The single-use link went to the caller and nowhere else: not the audit trail, not a job. */
    const token = new URL(url).pathname.split("/").pop()!;
    const audits = await prisma.auditLog.findMany({ where: { tenantId: { in: [T, w.E.tenant] } }, select: { action: true, before: true, after: true } });
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: { in: [T, w.E.tenant] } }, select: { payload: true } });
    expect(JSON.stringify(audits)).not.toContain(token);
    expect(JSON.stringify(jobs)).not.toContain(token);
  });

  it("4 · a 500 caused by a Prisma validation error logs the verdict and the stack, not the arguments it echoed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = await prisma.user
        .create({ data: { id: "ppii_bad", tenantId: T, email: SPONSOR.email, roles: ["ATHLETE"], legalName: SPONSOR.name } as never })
        .catch((e: unknown) => e as Error);
      expect((err as Error).name).toBe("PrismaClientValidationError");
      expect((err as Error).message).toContain(SPONSOR.email); // Prisma echoes it…
      const { logError } = await import("../src/lib/redact");
      logError("[error ref_ppii]", err);
      const printed = spy.mock.calls.flat().join("\n");
      expect(printed).toContain("PrismaClientValidationError");
      expect(printed).toMatch(/Invalid `[\w.]*create\(\)` invocation/);
      expect(printed).toMatch(/\bat\b/); // the stack is kept
      expect(printed).not.toContain(SPONSOR.email); // …the log does not
      expect(printed).not.toContain(SPONSOR.name);
    } finally {
      spy.mockRestore();
    }
  });

  /* ── the owner's decisions, 2026-10-06 ── */

  const DAY = 86_400_000;
  async function supportMessage(id: string, o: { state?: "QUEUED" | "DRAFT"; queuedAt?: Date | null; createdAt?: Date; files?: Array<{ id: string; uploaded?: boolean }> } = {}) {
    await prisma.supportMessage.create({ data: {
      id, tenantId: T, name: "Rosa Lopez", email: "rosa.lopez@ppii-test.invalid", topic: "GUARDIANSHIP", message: "Here is my daughter's birth certificate.",
      state: o.state ?? "QUEUED", queuedAt: o.queuedAt === undefined ? new Date() : o.queuedAt, createdAt: o.createdAt ?? new Date(),
    }, select: { id: true } });
    for (const f of o.files ?? []) {
      await prisma.supportAttachment.create({ data: {
        id: f.id, tenantId: T, messageId: id, filename: `${f.id}.pdf`, contentType: "application/pdf", bytes: 1234,
        r2Key: `support/${id}/${f.id}/${f.id}.pdf`, uploadedAt: f.uploaded === false ? null : new Date(),
      }, select: { id: true } });
    }
  }

  it("O1 · BTG's support desk reads a message and opens each attachment through a five-minute, audited link; nobody else can", async () => {
    await supportMessage("ppii_sm_desk", { files: [{ id: "ppii_satt_proof" }, { id: "ppii_satt_pending", uploaded: false }] });
    const admin = w.id("admin");
    const view = await w.call("GET", "/support-messages/ppii_sm_desk", admin);
    expect(view.status, view.text).toBe(200);
    expect(view.json).toMatchObject({ id: "ppii_sm_desk", topic: "GUARDIANSHIP", topicLabel: "Guardianship", state: "QUEUED" });
    expect(view.json.attachments.map((a: { id: string; arrived: boolean }) => [a.id, a.arrived])).toEqual([["ppii_satt_proof", true], ["ppii_satt_pending", false]]);
    /* The page gets names, never a key or a link. */
    expect(view.text).not.toMatch(/support\/ppii_sm_desk|X-Amz|https?:\/\//);

    const link = await w.call("GET", "/support-messages/ppii_sm_desk/attachments/ppii_satt_proof", admin);
    expect(link.status, link.text).toBe(200);
    expect(link.json.expiresInSeconds).toBe(300);
    expect(new URL(link.json.url).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(new URL(link.json.url).pathname).toContain("/support/ppii_sm_desk/ppii_satt_proof/");
    const grant = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "storage.privateDownloadGrant", entity: "SupportAttachment", entityId: "ppii_satt_proof" }, select: { actorId: true, after: true } });
    expect(grant).toMatchObject({ actorId: admin, after: { ttlSeconds: 300 } });
    expect(JSON.stringify(grant)).not.toContain("X-Amz-Signature");
    expect((await w.call("GET", "/support-messages/ppii_sm_desk/attachments/ppii_satt_pending", admin)).status).toBe(409);

    /* Finance, the sponsor and another tenant's BTG admin are all refused, the same way as a made-up id. */
    for (const who of [w.id("finance"), w.id("buyer"), w.id("other_admin")]) {
      expect((await w.call("GET", "/support-messages/ppii_sm_desk", who)).status, who).toBe(403);
      expect((await w.call("GET", "/support-messages/ppii_sm_desk/attachments/ppii_satt_proof", who)).status, who).toBe(403);
    }
    expect((await w.call("GET", "/support-messages/ppii_sm_nope", admin)).status).toBe(403);
    expect((await w.call("GET", "/support-messages/ppii_sm_desk", undefined)).status).toBe(401);
  });

  it("O2 · support attachments are deleted 90 days after the message was sent, or 30 after an unsent one was started — object first, audited, the message kept", async () => {
    const now = new Date();
    await supportMessage("ppii_sm_old", { queuedAt: new Date(now.getTime() - 91 * DAY), createdAt: new Date(now.getTime() - 91 * DAY), files: [{ id: "ppii_satt_old" }] });
    await supportMessage("ppii_sm_recent", { queuedAt: new Date(now.getTime() - 89 * DAY), createdAt: new Date(now.getTime() - 89 * DAY), files: [{ id: "ppii_satt_recent" }] });
    await supportMessage("ppii_sm_draft_old", { state: "DRAFT", queuedAt: null, createdAt: new Date(now.getTime() - 31 * DAY), files: [{ id: "ppii_satt_draft_old", uploaded: false }] });
    await supportMessage("ppii_sm_draft_new", { state: "DRAFT", queuedAt: null, createdAt: new Date(now.getTime() - 29 * DAY), files: [{ id: "ppii_satt_draft_new", uploaded: false }] });
    const { purgeExpiredClosures } = await import("../src/domain/account-closure");
    const deleted: string[] = [];
    const run = await purgeExpiredClosures(prisma, now, async (k) => { deleted.push(k); }, T);
    expect(run.supportAttachments).toBe(2);
    expect(deleted.sort()).toEqual(["support/ppii_sm_draft_old/ppii_satt_draft_old/ppii_satt_draft_old.pdf", "support/ppii_sm_old/ppii_satt_old/ppii_satt_old.pdf"]);
    const left = (await prisma.supportAttachment.findMany({ where: { tenantId: T, id: { startsWith: "ppii_satt_" } }, select: { id: true } })).map((r) => r.id).sort();
    expect(left).toEqual(expect.arrayContaining(["ppii_satt_recent", "ppii_satt_draft_new"]));
    expect(left).not.toContain("ppii_satt_old");
    expect(left).not.toContain("ppii_satt_draft_old");
    expect(await prisma.supportMessage.count({ where: { tenantId: T, id: { in: ["ppii_sm_old", "ppii_sm_draft_old"] } } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "support.attachmentPurged", entityId: { in: ["ppii_sm_old", "ppii_sm_draft_old"] } } })).toBe(2);
    /* Twice changes nothing; a failed delete leaves the row for next time. */
    const { purgeSupportAttachments } = await import("../src/domain/account-closure");
    expect(await purgeSupportAttachments(prisma, now, async () => { throw new Error("must not delete"); }, T)).toBe(0);
    await supportMessage("ppii_sm_old2", { queuedAt: new Date(now.getTime() - 100 * DAY), files: [{ id: "ppii_satt_old2" }] });
    await expect(purgeSupportAttachments(prisma, now, async () => { throw new Error("storage down"); }, T)).rejects.toThrow(/storage down/);
    expect(await prisma.supportAttachment.count({ where: { tenantId: T, id: "ppii_satt_old2" } })).toBe(1);
  });

  it("O4 · finished Zoho webhook bodies older than 90 days are trimmed to their ids; the row, its status, its external id and the audit trail stay", async () => {
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * DAY);
    const raw = { invoiceId: "ppii_inv_1", dealId: "ppii_deal_1", status: "paid", amount: 5000, customer_name: SPONSOR.name, email: SPONSOR.email, billing_address: { street: SPONSOR.line1 } };
    await prisma.webhookDelivery.createMany({ data: [
      { id: "ppii_wd_applied", tenantId: T, source: "zoho", externalId: "ppii_inv_1", signatureOk: true, payload: raw, status: "APPLIED", receivedAt: at(91) },
      { id: "ppii_wd_rejected", tenantId: T, source: "zoho-crm", externalId: "Contacts:123", signatureOk: false, payload: { module: "Contacts", ids: ["123", "x@y"], operation: "update", First_Name: "Rosa", Email: SPONSOR.email }, status: "REJECTED", error: "channel token did not verify", receivedAt: at(120) },
      { id: "ppii_wd_failed", tenantId: T, source: "zoho", externalId: "ppii_inv_2", signatureOk: true, payload: { truncated: `{"customer_name":"${SPONSOR.name}"` }, status: "FAILED", receivedAt: at(95) },
      { id: "ppii_wd_unapplied", tenantId: T, source: "zoho", externalId: "ppii_inv_3", signatureOk: true, payload: raw, status: "RECEIVED", receivedAt: at(200) },
      { id: "ppii_wd_young", tenantId: T, source: "zoho", externalId: "ppii_inv_4", signatureOk: true, payload: raw, status: "APPLIED", receivedAt: at(89) },
      { id: "ppii_wd_other_tenant", tenantId: OTHER_T, source: "zoho", externalId: "ppii_inv_5", signatureOk: true, payload: raw, status: "APPLIED", receivedAt: at(300) },
    ] });
    const before = await prisma.auditLog.count({ where: { tenantId: { in: [T, OTHER_T] } } });
    const { trimZohoWebhookBodies } = await import("../src/domain/webhook-retention");
    expect(await trimZohoWebhookBodies(now, { tenantIds: [T] })).toEqual({ trimmed: 3 });

    const rows = new Map((await prisma.webhookDelivery.findMany({ where: { id: { startsWith: "ppii_wd_" } }, select: { id: true, payload: true, status: true, externalId: true, error: true, signatureOk: true, receivedAt: true } })).map((r) => [r.id, r]));
    expect(rows.get("ppii_wd_applied")).toMatchObject({ payload: { trimmed: true, invoiceId: "ppii_inv_1", dealId: "ppii_deal_1" }, status: "APPLIED", externalId: "ppii_inv_1", receivedAt: at(91) });
    expect(Object.keys(rows.get("ppii_wd_applied")!.payload as object).sort()).toEqual(["dealId", "invoiceId", "trimmed"]);
    expect(rows.get("ppii_wd_rejected")).toMatchObject({ payload: { trimmed: true, module: "Contacts", ids: ["123"], operation: "update" }, status: "REJECTED", error: "channel token did not verify", signatureOk: false });
    expect(rows.get("ppii_wd_failed")!.payload).toEqual({ trimmed: true });
    for (const id of ["ppii_wd_applied", "ppii_wd_rejected", "ppii_wd_failed"]) expect(leaks(JSON.stringify(rows.get(id)!.payload)), id).toEqual([]);
    /* Still to be applied, too young, or another tenant's (outside this run's scope): untouched. */
    for (const id of ["ppii_wd_unapplied", "ppii_wd_young", "ppii_wd_other_tenant"]) expect(rows.get(id)!.payload, id).toEqual(raw);

    /* The audit trail only grew: one row naming the trimmed deliveries. */
    expect(await prisma.auditLog.count({ where: { tenantId: { in: [T, OTHER_T] } } })).toBe(before + 1);
    const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "webhookDelivery.bodyTrimmed" }, select: { after: true } });
    expect((trail.after as { deliveries: string[] }).deliveries.sort()).toEqual(["ppii_wd_applied", "ppii_wd_failed", "ppii_wd_rejected"]);
    /* A second run finds nothing left to trim. */
    expect(await trimZohoWebhookBodies(now, { tenantIds: [T] })).toEqual({ trimmed: 0 });
  });

  it("O5 · a card number in BTG's payment, dispute, payout or earnings notes is refused with a 422 and a plain message", async () => {
    const card = "Customer read me 4242 4242 4242 4242 on the phone";
    const admin = w.id("admin");
    const finance = w.id("finance");
    const refused = [
      await w.call("POST", "/payment-events/ppii_evt_x/resolve", admin, { note: card }),
      await w.call("POST", "/disputes/ppii_dp_x/review", admin, { note: card }),
      await w.call("POST", "/disputes/ppii_dp_x/resolve", admin, { note: `Lost. ${card}` }),
      await w.call("POST", "/payouts/ppii_po_x/decision", admin, { decision: "REJECT", note: card }),
      await w.call("POST", "/earnings/ppii_earn_x/adjustment", admin, { adjustment: 100, reason: card }),
      await w.call("POST", "/earnings/ppii_earn_x/transition", finance, { to: "PAID", reference: "5555-5555-5555-4444" }),
    ];
    for (const r of refused) {
      expect(r.status, r.text).toBe(422);
      expect(r.json.error).toMatchObject({ code: "card_number", message: expect.stringMatching(/looks like it contains a card number\. SponsorX never stores card or bank numbers/) });
    }
    /* Without the number the same calls get past the check (to "no such record"). */
    expect((await w.call("POST", "/payment-events/ppii_evt_x/resolve", admin, { note: "Refunded in Stripe, pi_3Nx 2026-10-06, ticket 48213" })).status).not.toBe(422);
    expect((await w.call("POST", "/payouts/ppii_po_x/decision", admin, { decision: "REJECT", note: "Bank account 1234 closed; ask for new details" })).status).not.toBe(422);
  });
});

describe("O4 / O5 · the pure rules", () => {
  it("containsCardNumber finds a Luhn-valid card number anywhere in prose, written with spaces or dashes, and not other numbers", async () => {
    const { containsCardNumber, looksLikeCardNumber } = await import("../src/domain/marketplace-order-rules");
    for (const yes of ["4242424242424242", "card 4242 4242 4242 4242 refunded", "paid 06 10 4242-4242-4242-4242 ok", "amex 3782 822463 10005.", "5555555555554444"]) expect(containsCardNumber(yes), yes).toBe(true);
    for (const no of ["", null, "Refunded in Stripe, pi_3Nx 2026-10-06, ticket 48213", "4242 4242 4242 4241", "INV-000123, $1,250.00", "Zoho deal 12345"]) expect(containsCardNumber(no), String(no)).toBe(false);
    /* The whole-value check it builds on is unchanged. */
    expect(looksLikeCardNumber("4242 4242 4242 4242")).toBe(true);
    expect(looksLikeCardNumber("card 4242 4242 4242 4242")).toBe(false);
  });

  it("idsOnly keeps a body's ids and nothing else", async () => {
    const { idsOnly } = await import("../src/domain/webhook-retention");
    expect(idsOnly({ invoiceId: "i1", dealId: "d1", customer_id: "c1", amount: 5, name: "Rosa", nested: { id: "n" } })).toEqual({ trimmed: true, invoiceId: "i1", dealId: "d1", customer_id: "c1" });
    expect(idsOnly({ module: "Deals", ids: ["1", "rosa@x.org"], operation: "insert", channel_id: "77" })).toEqual({ trimmed: true, module: "Deals", ids: ["1"], operation: "insert", channel_id: "77" });
    expect(idsOnly("plain text")).toEqual({ trimmed: true });
    expect(idsOnly(["a"])).toEqual({ trimmed: true });
  });
});
