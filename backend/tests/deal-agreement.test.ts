import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-14 — Deal Chat's agreement between an order's sponsor and one seller.

   The pure half: which form an item takes, the cards a deal asks, the exact
   D3 sentence of every answer (checked against the approved wording in
   documentation/deal-chat/), the filled-in text (forms kept and lettered,
   typed text never reaching into the template, every card required), and
   the PDF page.

   Then against a real database and through the API where a person acts:
   opening (forms from what was bought, a package's items included; a minor
   named with their guardian; a newer form withdrawing the open one), signing
   (the sponsor's admin, the seller, a guardian for a minor; a stale hash, a
   second signature, the analyst, another sponsor, BTG and a stranger all
   refused), both signatures making it SIGNED, a signed deal never replaced,
   the order card and the item card carrying it, and the download — to its
   two sides and BTG, at any time, and to nobody else.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@deal-test.invalid` } : null;
  },
}));
/* Chromium is the report renderer's concern (report-render.test.ts); here the page it is handed is what matters. */
const rendered: string[] = [];
vi.mock("../src/domain/report-render", async (orig) => ({
  ...(await orig<typeof import("../src/domain/report-render")>()),
  renderPdf: async (html: string) => (rendered.push(html), Buffer.from(`%PDF-1.4 stub ${html.length}`)),
}));

const { DEAL_CARDS, answerSentence, cardsFor, formsFor, isValidAnswer } = await import("../src/domain/deal-cards");
const { DealAgreementIncompleteError, renderDealAgreement } = await import("../src/domain/deal-agreement-render");
const { dealAgreementHtml } = await import("../src/domain/deal-agreement");

const TEMPLATE = await readFile(new URL("../agreements/DEAL.v1.txt", import.meta.url), "utf8");
const APPROVED = await readFile(new URL("../../documentation/deal-chat/SponsorX-Deal-Agreement-Forms-Draft.md", import.meta.url), "utf8");

const ALL_YES = (forms: Parameters<typeof cardsFor>[0]) =>
  Object.fromEntries(cardsFor(forms).map((c) => [c.key, c.multi ? ["INSTAGRAM"] : c.answers[0]!.value]));
const facts = (over: Record<string, unknown> = {}) => ({
  forms: ["CONTENT"] as const,
  sponsorName: "Harbor Coffee",
  seller: { kind: "ATHLETE" as const, name: "Riley Park" },
  orderRef: "SX-ABCDEF12",
  date: new Date("2026-11-17T10:00:00Z"),
  items: [{ title: "Instagram post", quantity: 1, startsOn: new Date("2026-12-01T00:00:00Z"), endsOn: new Date("2026-12-01T00:00:00Z") }],
  answers: ALL_YES(["CONTENT"]),
  specialTerms: [],
  amountCents: 100_000,
  originalAmountCents: 100_000,
  ...over,
});

describe("2S4-BE-14 · the forms and the cards", () => {
  it("each item kind takes its form; a deal's forms come in catalogue order", () => {
    expect(formsFor(["VIDEO", "SOCIAL_POST"])).toEqual(["CONTENT"]);
    expect(formsFor(["SIGNAGE", "APPEARANCE", "SOCIAL_POST"])).toEqual(["CONTENT", "IN_PERSON", "PLACEMENT"]);
    expect(formsFor(["CAMP", "AUTOGRAPH"])).toEqual(["IN_PERSON"]);
    expect(formsFor(["TICKETS", "OTHER", "SOMETHING_NEW"])).toEqual(["PLACEMENT"]);
    expect(formsFor(["PACKAGE"])).toEqual([]); // a package is given as its items' kinds
  });

  it("every deal asks approval and exclusivity; each form adds its own cards", () => {
    expect(cardsFor(["CONTENT"]).map((c) => c.key)).toEqual(["APPROVAL_FIRST", "EXCLUSIVITY", "REUSE", "PAID_ADS", "USAGE_PERIOD", "PLATFORMS", "CHANGES"]);
    expect(cardsFor(["IN_PERSON"]).map((c) => c.key)).toEqual(["APPROVAL_FIRST", "EXCLUSIVITY", "TRAVEL", "FILMING", "LENGTH"]);
    expect(cardsFor(["PLACEMENT"]).map((c) => c.key)).toEqual(["APPROVAL_FIRST", "EXCLUSIVITY", "MATERIALS", "PERIOD_AS_LISTED"]);
    expect(cardsFor(["CONTENT", "PLACEMENT"])).toHaveLength(9);
  });

  it("every answer's sentence is word for word the approved one", () => {
    const flat = APPROVED.replace(/\s+/g, " ");
    /* The draft writes a choice card as one sentence with a slot: "for *30 days / 90 days / 1 year* from…". */
    const slotted = (c: (typeof DEAL_CARDS)[number], a: (typeof c.answers)[number]) => {
      const options = c.answers.map((x) => x.sentence.replace(/^.*?(\d+ days|\d+ year|\d+ hours?|half a day)\b.*$/, "$1"));
      const mine = options[c.answers.indexOf(a)]!;
      return options.every((o, i) => o !== c.answers[i]!.sentence) ? a.sentence.replace(mine, `*${options.join(" / ")}*`) : a.sentence;
    };
    for (const c of DEAL_CARDS) {
      if (c.multi) continue;
      for (const a of c.answers) expect(flat, `${c.key}=${a.value}`).toContain(slotted(c, a).replace(/\s+/g, " "));
    }
    expect(answerSentence(DEAL_CARDS.find((c) => c.key === "PLATFORMS")!, ["YOUTUBE", "INSTAGRAM", "TIKTOK"]))
      .toBe("The content is posted on Instagram, TikTok and YouTube.");
  });

  it("only the card's own answers are valid; a multi card needs at least one, none repeated", () => {
    const paid = DEAL_CARDS.find((c) => c.key === "PAID_ADS")!;
    const platforms = DEAL_CARDS.find((c) => c.key === "PLATFORMS")!;
    expect(isValidAnswer(paid, "YES")).toBe(true);
    expect(isValidAnswer(paid, "MAYBE")).toBe(false);
    expect(isValidAnswer(paid, ["YES"])).toBe(false);
    expect(isValidAnswer(platforms, [])).toBe(false);
    expect(isValidAnswer(platforms, ["X", "X"])).toBe(false);
    expect(isValidAnswer(platforms, ["X", "TIKTOK"])).toBe(true);
    expect(() => answerSentence(paid, "MAYBE")).toThrow();
  });

  it("the D6 restricted list in force names all six categories", () => {
    expect(TEMPLATE).toContain("alcohol, tobacco or vaping, cannabis, gambling, firearms or adult content");
  });
});

describe("2S4-BE-14 · the filled-in agreement", () => {
  it("one form: its own D7, no letters, every blank filled", () => {
    const text = renderDealAgreement(TEMPLATE, facts());
    expect(text).toContain("SPONSORX DEAL AGREEMENT — CONTENT — VERSION 1");
    expect(text).toContain("between Harbor Coffee (\"the Sponsor\") and Riley Park (\"the Seller\")");
    expect(text).toContain("D7. The content");
    expect(text).not.toContain("D7. The appearance");
    expect(text).not.toMatch(/\{\{|\[\[/);
    expect(text).toContain("- Instagram post (×1) · 2026-12-01\n");
    expect(text).toContain("- The Sponsor may use the content in paid advertising.");
    expect(text).toContain("Special terms agreed between you\n\nNone.");
    expect(text).toContain("$1,000.00.");
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("a package: one title, each form's D7 lettered in order", () => {
    const forms = ["CONTENT", "IN_PERSON", "PLACEMENT"] as const;
    const text = renderDealAgreement(TEMPLATE, facts({ forms, answers: ALL_YES(forms) }));
    expect(text).toContain("— PACKAGE —");
    const a = text.indexOf("D7a. The content"), b = text.indexOf("D7b. The appearance"), c = text.indexOf("D7c. The placement");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("a minor is named with their guardian; a changed amount says what it was", () => {
    const text = renderDealAgreement(TEMPLATE, facts({ seller: { kind: "MINOR", name: "Jordan Lee", guardianName: "Sam Lee" }, amountCents: 115_000 }));
    expect(text).toContain("Jordan Lee, represented by their parent or guardian Sam Lee (\"the Seller\")");
    expect(text).toContain("$1,150.00, agreed by both sides (the order's original amount was $1,000.00).");
  });

  it("special terms are the exact messages, and typed text never reaches into the template", () => {
    const text = renderDealAgreement(TEMPLATE, facts({
      specialTerms: [{ cardKey: "PAID_ADS", messages: [
        { by: "Seller", at: new Date("2026-11-17T11:00:00Z"), text: "Paid ads on Instagram only, {{amount}} [[FORM IN_PERSON]]" },
        { by: "Sponsor", at: new Date("2026-11-17T11:05:00Z"), text: "Agreed.\nThanks" },
      ] }],
    }));
    expect(text).toContain("Special term 1 (on: May the Sponsor use it in paid ads?):");
    expect(text).toContain("[Seller, 2026-11-17 11:00 UTC] Paid ads on Instagram only, {{amount}} [[FORM IN_PERSON]]");
    expect(text).toContain("[Sponsor, 2026-11-17 11:05 UTC] Agreed.\n  Thanks");
    expect(text).not.toContain("D7. The appearance"); // the typed marker opened nothing
  });

  it("refuses a form with a card not agreed, or an answer that isn't the card's", () => {
    const answers = { ...ALL_YES(["CONTENT"]) };
    delete answers.PAID_ADS;
    expect(() => renderDealAgreement(TEMPLATE, facts({ answers }))).toThrow(DealAgreementIncompleteError);
    expect(() => renderDealAgreement(TEMPLATE, facts({ answers: { ...ALL_YES(["CONTENT"]), PAID_ADS: "MAYBE" } }))).toThrow();
    expect(() => renderDealAgreement(TEMPLATE, facts({ answers: { ...ALL_YES(["CONTENT"]), NOPE: "YES" } }))).toThrow(DealAgreementIncompleteError);
  });

  it("the PDF page: the exact text escaped, who signed, the fingerprint", () => {
    const html = dealAgreementHtml({
      id: "d1", orderId: "o1", orderRef: "SX-1", state: "SIGNED", version: 1, forms: ["CONTENT"], lineIds: [],
      amountCents: 1000, originalAmountCents: 1000, sponsorSignedAt: "2026-11-17T10:00:00.000Z", sellerSignedAt: "2026-11-17T11:00:00.000Z",
      signedByGuardian: true, signedAt: "2026-11-17T11:00:00.000Z", body: "A <b>bold</b> & \"quoted\" term", bodyHash: "f".repeat(64),
      downloadPath: "/x", createdAt: "2026-11-17T09:00:00.000Z",
    });
    expect(html).toContain("A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; term");
    expect(html).toContain("Signed by both sides");
    expect(html).toContain("Signed for the Sponsor on 2026-11-17 10:00 UTC");
    expect(html).toContain("Signed by the Seller&#39;s parent or guardian".replace("&#39;", "'"));
    expect(html).toContain("f".repeat(64));
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-14 · deal agreements, end to end", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { openDealAgreement, signDealAgreement, DealAgreementError } = await import("../src/domain/deal-agreement");
  type Actor = import("../src/auth/actor").Actor;

  const T = "dea_tenant_a";
  const OTHER = "dea_tenant_b";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, "user-agent": "deal-test", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    let json: ReturnType<typeof JSON.parse> = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* a PDF */ }
    return { status: res.status, text, json, type: res.headers.get("content-type") ?? "", disposition: res.headers.get("content-disposition") ?? "" };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  const user = async (id: string, roles: string[], extra: Record<string, unknown> = {}, tenant = T) =>
    prisma.user.create({ data: { id, tenantId: tenant, clerkId: id, email: `${id}@deal-test.invalid`, roles, ...extra } as never });

  let orderSeq = 0;
  /** An order from the sponsor: one line per [item, seller] given. */
  async function order(lines: Array<{ item: string; athleteId?: string; propertyId?: string; total?: number }>) {
    const id = p(`ord${orderSeq++}`);
    await prisma.reservation.create({ data: { id: `${id}_res`, tenantId: T, sponsorId: p("sponsor"), cartId: `${id}_cart`, expiresAt: inDays(1) } });
    await prisma.marketplaceOrder.create({ data: {
      id, tenantId: T, sponsorId: p("sponsor"), reservationId: `${id}_res`, state: "PENDING_SELLER",
      subtotalCents: 0, feesCents: 0, totalCents: 0, requiresApproval: false, approvalReasons: [],
      lines: { create: lines.map((l, i) => ({
        id: `${id}_l${i}`, tenantId: T, listingId: `${id}_lst${i}`, inventoryItemId: p(l.item), itemTenantId: T,
        propertyId: l.propertyId ?? null, sellerAthleteId: l.athleteId ?? null, title: `Item ${l.item}`, quantity: 1,
        startsOn: inDays(10), endsOn: inDays(12), unitPriceCents: l.total ?? 50_000, lineTotalCents: l.total ?? 50_000,
      })) },
    } });
    return id;
  }
  const answersFor = (forms: Parameters<typeof cardsFor>[0]) => ALL_YES(forms);

  const sponsorAdmin: Actor = { userId: p("sa"), tenantId: T, roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor"), athleteId: null, guardianId: null, propertyId: null };
  const minorSelf: Actor = { userId: p("jordan_user"), tenantId: T, roles: ["ATHLETE"], sponsorId: null, athleteId: p("jordan"), guardianId: null, propertyId: null };
  const guardianFor: Actor = { userId: p("sam_user"), tenantId: T, roles: ["ATHLETE"], sponsorId: null, athleteId: p("jordan"), guardianId: p("sam"), propertyId: null, actingFor: { athleteId: p("jordan"), guardianId: p("sam") } };
  const signAs = (a: Actor, id: string, hash: string) => signDealAgreement(a, id, { bodyHashShown: hash, ip: "127.0.0.1", userAgent: "deal-test" });

  beforeAll(async () => {
    await wipe();
    for (const t of [T, OTHER]) await prisma.tenant.create({ data: { id: t, name: `DEA ${t}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "Harbor Coffee", categories: [] } });
    await prisma.sponsor.create({ data: { id: p("rival"), tenantId: T, name: "Rival Roasters", categories: [] } });
    await prisma.guardian.create({ data: { id: p("sam"), tenantId: T, legalName: "Sam Lee", email: "sam@deal-test.invalid", relationship: "PARENT", verifiedAt: new Date() } as never });
    await prisma.athlete.create({ data: { id: p("riley"), tenantId: T, slug: p("riley"), legalName: "Riley Park", displayName: "Riley P", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.athlete.create({ data: {
      id: p("jordan"), tenantId: T, slug: p("jordan"), legalName: "Jordan Lee", displayName: "Jordan L", sport: "Soccer", ageBand: "16_17",
      birthDate: new Date(Date.now() - 16 * 365 * DAY), majorityAge: 18, state: "ACTIVE", guardianId: p("sam"),
    } as never });
    await prisma.property.create({ data: { id: p("hawks"), tenantId: T, slug: p("hawks"), name: "Westfield Hawks", kind: "TEAM" } as never });
    /* One owner each (InventoryItem_one_owner). */
    const owned = { post: { athleteId: p("riley") }, video: { athleteId: p("riley") }, visit: { athleteId: p("jordan") }, banner: { propertyId: p("hawks") }, bundle: { athleteId: p("jordan") } };
    for (const [id, kind] of [["post", "SOCIAL_POST"], ["video", "VIDEO"], ["visit", "APPEARANCE"], ["banner", "SIGNAGE"], ["bundle", "PACKAGE"]] as const) {
      await prisma.inventoryItem.create({ data: { id: p(id), tenantId: T, title: id, kind, priceCents: 50_000, categories: [], active: true, ...owned[id] } });
    }
    await prisma.bundleComponent.create({ data: { tenantId: T, bundleItemId: p("bundle"), componentItemId: p("visit"), quantity: 1 } });
    await prisma.bundleComponent.create({ data: { tenantId: T, bundleItemId: p("bundle"), componentItemId: p("banner"), quantity: 1 } });
    await user(p("sa"), ["SPONSOR_ADMIN"], { sponsorId: p("sponsor") });
    await user(p("an"), ["SPONSOR_ANALYST"], { sponsorId: p("sponsor") });
    await user(p("rival_sa"), ["SPONSOR_ADMIN"], { sponsorId: p("rival") });
    await user(p("riley_user"), ["ATHLETE"], { athleteId: p("riley") });
    await user(p("jordan_user"), ["ATHLETE"], { athleteId: p("jordan") });
    await user(p("sam_user"), ["GUARDIAN"], { guardianId: p("sam") });
    await user(p("mgr"), ["PROPERTY_MGR"], { propertyId: p("hawks") });
    await user(p("admin"), ["BTG_ADMIN"]);
    await user(`${OTHER}_admin`, ["BTG_ADMIN"], {}, OTHER);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const open = (orderId: string, seller: { athleteId: string } | { propertyId: string }, forms: Parameters<typeof cardsFor>[0], amountCents = 50_000, specialTerms: never[] = []) =>
    prisma.$transaction((tx) => openDealAgreement(tx, { orderId, seller, answers: answersFor(forms), specialTerms, amountCents }));

  it("opens the form from what was bought, the DEAL version in force, the seller's lines only", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }, { item: "video", athleteId: p("riley") }, { item: "banner", propertyId: p("hawks") }]);
    const d = await open(o, { athleteId: p("riley") }, ["CONTENT"], 120_000);
    const row = await prisma.dealAgreement.findUniqueOrThrow({ where: { id: d.id }, select: { id: true, forms: true, lineIds: true, amountCents: true, originalAmountCents: true, state: true, athleteTenantId: true, body: true, agreementId: true, agreement: { select: { kind: true, version: true } } } });
    expect(row).toMatchObject({ forms: ["CONTENT"], lineIds: [`${o}_l0`, `${o}_l1`], amountCents: 120_000, originalAmountCents: 100_000, state: "OPEN", athleteTenantId: T });
    expect(row.agreement).toMatchObject({ kind: "DEAL", version: 1 });
    expect(row.body).toContain("Riley Park (\"the Seller\")");
    expect(row.body).toContain("$1,200.00, agreed by both sides (the order's original amount was $1,000.00).");
    /* The team's form, from a banner: placement only. */
    const t = await open(o, { propertyId: p("hawks") }, ["PLACEMENT"]);
    expect((await prisma.dealAgreement.findUniqueOrThrow({ where: { id: t.id }, select: { forms: true } })).forms).toEqual(["PLACEMENT"]);
    /* A form whose cards don't match what was bought is refused. */
    await expect(open(o, { athleteId: p("riley") }, ["PLACEMENT"])).rejects.toThrow(/Not every question is agreed/);
    /* Someone who sells nothing on the order. */
    await expect(open(o, { athleteId: p("jordan") }, ["CONTENT"])).rejects.toThrow(DealAgreementError);
  });

  it("a package is given its items' forms; a minor is named with their guardian", async () => {
    const o = await order([{ item: "bundle", athleteId: p("jordan") }]);
    const d = await open(o, { athleteId: p("jordan") }, ["IN_PERSON", "PLACEMENT"]);
    const row = await prisma.dealAgreement.findUniqueOrThrow({ where: { id: d.id }, select: { forms: true, body: true } });
    expect(row.forms).toEqual(["IN_PERSON", "PLACEMENT"]);
    expect(row.body).toContain("Jordan Lee, represented by their parent or guardian Sam Lee");
    expect(row.body).toContain("D7a. The appearance");
    expect(row.body).toContain("D7b. The placement");
  });

  it("a newer form withdraws the open one; signing the old one is refused", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const first = await open(o, { athleteId: p("riley") }, ["CONTENT"]);
    const second = await open(o, { athleteId: p("riley") }, ["CONTENT"], 60_000);
    expect((await prisma.dealAgreement.findUniqueOrThrow({ where: { id: first.id }, select: { state: true } })).state).toBe("WITHDRAWN");
    await expect(signAs(sponsorAdmin, first.id, first.bodyHash)).rejects.toThrow(/replaced by a newer one/);
    expect((await prisma.dealAgreement.findUniqueOrThrow({ where: { id: second.id }, select: { state: true } })).state).toBe("OPEN");
  });

  it("both sides sign through the API: stale hashes, second signatures and outsiders refused; then SIGNED and locked", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const d = await open(o, { athleteId: p("riley") }, ["CONTENT"]);
    const sign = (who: string, hash = d.bodyHash) => call("POST", `/deal-agreements/${d.id}/sign`, who, { bodyHashShown: hash });

    expect((await sign(p("sa"), "0".repeat(64))).status).toBe(409); // not the text shown
    for (const who of [p("an"), p("rival_sa"), p("admin"), p("mgr"), p("jordan_user"), `${OTHER}_admin`]) {
      expect((await sign(who)).status, who).toBe(403);
    }
    const s1 = await sign(p("sa"));
    expect(s1.status, s1.text).toBe(200);
    expect(s1.json).toMatchObject({ state: "OPEN", sellerSignedAt: null });
    expect(s1.json.sponsorSignedAt).toBeTruthy();
    expect((await sign(p("sa"))).status).toBe(409); // already signed
    const s2 = await sign(p("riley_user"));
    expect(s2.status, s2.text).toBe(200);
    expect(s2.json).toMatchObject({ state: "SIGNED", signedByGuardian: false });
    expect(s2.json.signedAt).toBeTruthy();

    const ACC = { select: { bodyHash: true, agreementId: true, tenantId: true, userAgent: true, userId: true } } as const;
    const row = await prisma.dealAgreement.findUniqueOrThrow({ where: { id: d.id }, select: { agreementId: true, sponsorAcceptance: ACC, sellerAcceptance: ACC } });
    for (const a of [row.sponsorAcceptance!, row.sellerAcceptance!]) expect(a).toMatchObject({ bodyHash: d.bodyHash, agreementId: row.agreementId, tenantId: T, userAgent: "deal-test" });
    expect(row.sponsorAcceptance!.userId).toBe(p("sa"));
    expect(row.sellerAcceptance!.userId).toBe(p("riley_user"));
    expect(await prisma.auditLog.count({ where: { entityId: d.id, action: "dealAgreement.sign" } })).toBe(2);
    /* A signed deal is never replaced. */
    await expect(open(o, { athleteId: p("riley") }, ["CONTENT"])).rejects.toThrow(/already signed/);
  });

  it("a minor signs only through their guardian, and the signature names the guardian", async () => {
    const o = await order([{ item: "post", athleteId: p("jordan") }]);
    const d = await open(o, { athleteId: p("jordan") }, ["CONTENT"]);
    await expect(signAs(minorSelf, d.id, d.bodyHash)).rejects.toThrow();
    const v = await signAs(guardianFor, d.id, d.bodyHash);
    expect(v).toMatchObject({ signedByGuardian: true, state: "OPEN" });
    const row = await prisma.dealAgreement.findUniqueOrThrow({ where: { id: d.id }, select: { sellerAcceptance: { select: { userId: true, guardianId: true } } } });
    expect(row.sellerAcceptance).toMatchObject({ userId: p("sam_user"), guardianId: p("sam") });
  });

  it("the team's manager signs for the team", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const d = await open(o, { propertyId: p("hawks") }, ["PLACEMENT"]);
    const r = await call("POST", `/deal-agreements/${d.id}/sign`, p("mgr"), { bodyHashShown: d.bodyHash });
    expect(r.status, r.text).toBe(200);
    expect(r.json.sellerSignedAt).toBeTruthy();
  });

  it("the order card and the item card carry it; reading and the download are for its two sides and BTG only", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const d = await open(o, { athleteId: p("riley") }, ["CONTENT"]);
    await prisma.orderLineDelivery.create({ data: {
      tenantId: T, orderId: o, lineId: `${o}_l0`, sponsorId: p("sponsor"), athleteId: p("riley"), athleteTenantId: T, state: "UNPAID",
    } as never });

    const orderRead = await call("GET", `/marketplace-orders/${o}`, p("sa"));
    expect(orderRead.status, orderRead.text).toBe(200);
    expect(orderRead.json.dealAgreements).toEqual([expect.objectContaining({ id: d.id, state: "OPEN", downloadPath: `/api/v1/deal-agreements/${d.id}/download` })]);
    const list = await call("GET", "/marketplace-orders", p("sa"));
    expect(list.json.orders.find((x: { id: string }) => x.id === o).dealAgreements[0].id).toBe(d.id);

    const sales = await call("GET", "/sales", p("riley_user"));
    expect(sales.status, sales.text).toBe(200);
    expect(sales.json.sales.find((s: { lineId?: string; id?: string }) => (s.lineId ?? s.id) === `${o}_l0`).dealAgreement).toMatchObject({ id: d.id, sellerSigned: false });

    for (const who of [p("sa"), p("an"), p("riley_user"), p("admin")]) {
      const r = await call("GET", `/deal-agreements/${d.id}`, who);
      expect(r.status, who).toBe(200);
      expect(r.json.body).toContain("SPONSORX DEAL AGREEMENT");
      const pdf = await call("GET", `/deal-agreements/${d.id}/download`, who);
      expect(pdf.status, who).toBe(200);
      expect(pdf.type).toContain("application/pdf");
      expect(pdf.disposition).toMatch(/attachment; filename="SponsorX-deal-agreement-SX-[A-Z0-9_]+\.pdf"/);
      expect(pdf.text.startsWith("%PDF")).toBe(true);
    }
    expect(rendered.at(-1)).toContain("Not yet signed by the Seller");
    for (const who of [p("rival_sa"), p("jordan_user"), p("mgr"), `${OTHER}_admin`]) {
      expect((await call("GET", `/deal-agreements/${d.id}`, who)).status, who).toBe(403);
      expect((await call("GET", `/deal-agreements/${d.id}/download`, who)).status, who).toBe(403);
    }
    const rival = await call("GET", `/marketplace-orders/${o}`, p("rival_sa"));
    expect(rival.status).not.toBe(200);
  });
});
