import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The Zoho sync, end to end against a real database — P8-INT-01, -02, -05,
   -06, -07, §18, field-mapping §7 and §8.

   Every flow here starts where production starts: a domain function a route
   calls (transitionBrief, createCampaignFromBrief, transitionCampaign, the
   enquiry handler). What it enqueued is then drained exactly as the worker
   drains it — the outbox row's tenant stamped onto the payload — into the
   worker's own handlers, which talk to a fake org with Zoho's upsert
   semantics. So each acceptance is asserted on the path a real request
   takes, not on a function nobody calls.

   Skipped without a database, with a reason. CI has one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "zt_tenant";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const { FakeZoho } = await import("./support/fake-zoho");

describe.skipIf(!hasDatabase)("the Zoho sync, on the path a request takes", async () => {
  const { prisma } = await import("../src/db/client");
  const { transitionBrief } = await import("../src/domain/brief");
  const { createCampaignFromBrief, transitionCampaign } = await import("../src/domain/campaign");
  const { submitInquiry } = await import("../src/routes/v1/inquiries");
  const sync = await import("../src/domain/zoho-sync");
  const jobs = await import("../worker/jobs/zoho-sync.mts");

  const T = "zt_tenant";
  const actor = {
    userId: "zt_user", tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };

  let zoho: InstanceType<typeof FakeZoho>;
  const deps = () => ({ db: prisma, zoho: () => zoho as never });
  const ctx = () => ({ db: prisma, zoho });

  async function clean() {
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.syncTask.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.zohoReconciliation.deleteMany({ where: { tenantId: T } });
    await prisma.inquiry.deleteMany({ where: { tenantId: T } });
    await prisma.campaign.deleteMany({ where: { tenantId: T } });
    await prisma.campaignBrief.deleteMany({ where: { tenantId: T } });
    await prisma.sponsorContact.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.webhookDelivery.deleteMany({ where: { source: "zoho-crm-test" } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeEach(async () => {
    zoho = new FakeZoho();
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Zoho sync test tenant" } });
    await prisma.user.create({
      data: { id: "zt_user", tenantId: T, clerkId: "clerk_zt_user", email: "ops@btg.test", roles: ["BTG_ADMIN"] },
    });
    await prisma.sponsor.create({ data: { id: "zt_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.sponsorContact.create({
      data: {
        id: "zt_contact", tenantId: T, sponsorId: "zt_sponsor", name: "Rosa Delgado",
        email: "rosa@rosas.test", phone: "301-555-0100", title: "Owner", isPrimary: true,
      },
    });
    await prisma.campaignBrief.create({
      data: {
        id: "zt_brief", tenantId: T, sponsorId: "zt_sponsor", objective: "Fall foot traffic",
        budget: 250_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"),
        sports: [], stateCodes: ["MD"], categories: [],
      },
    });
  });

  afterAll(async () => {
    await clean();
  });

  /** Drain the outbox the way the worker does, into the worker's handlers. */
  async function drain(): Promise<string[]> {
    const ran: string[] = [];
    for (let pass = 0; pass < 10; pass++) {
      const rows = await prisma.outboxJob.findMany({
        where: { tenantId: T, dispatchedAt: null }, orderBy: { createdAt: "asc" },
        select: { id: true, name: true, payload: true, tenantId: true },
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        await prisma.outboxJob.update({ where: { id: row.id }, data: { dispatchedAt: new Date() } });
        const data = { ...(row.payload as object), tenantId: row.tenantId } as never;
        const handlers: Record<string, (d: never) => Promise<unknown>> = {
          "zoho.pushDeal": (d) => jobs.handlePushDeal(deps(), d),
          "zoho.pushCampaign": (d) => jobs.handlePushDeal(deps(), d),
          "zoho.pushTask": (d) => jobs.handlePushTask(deps(), d),
          "zoho.pushLead": (d) => jobs.handlePushLead(deps(), d),
          "zoho.pushRenewal": (d) => jobs.handlePushRenewal(deps(), d),
        };
        const handler = handlers[row.name];
        if (handler) {
          await handler(data);
          ran.push(row.name);
        }
      }
    }
    return ran;
  }

  /** Feed every pending notification back through the inbound path. */
  async function deliverNotifications() {
    const outcomes = [];
    while (zoho.notifications.length) {
      const n = zoho.notifications.shift()!;
      const record = await zoho.get(n.module, n.id);
      if (record) outcomes.push(await sync.applyZohoRecord(ctx(), n.module, record));
    }
    return outcomes;
  }

  describe("P8-INT-01 · Accounts, Contacts, Deals and Tasks push from the worker, deduped on SponsorX_ID", () => {
    it("qualifying a brief puts all four into Zoho, parents first", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      const ran = await drain();
      expect(ran.sort()).toEqual(["zoho.pushDeal", "zoho.pushTask"]);

      const [account] = zoho.all("Accounts");
      const [contact] = zoho.all("Contacts");
      const [deal] = zoho.all("Deals");
      const [task] = zoho.all("Tasks");
      expect(account).toMatchObject({ SponsorX_ID: "zt_sponsor", Account_Name: "Rosa's Tacos", Account_Type: "Customer" });
      expect(contact).toMatchObject({ SponsorX_ID: "zt_contact", Last_Name: "Rosa Delgado", Account_Name: { id: account!.id } });
      expect(contact!.First_Name).toBeUndefined(); // never guessed by splitting (§3 Names)
      expect(deal).toMatchObject({
        SponsorX_ID: "brief:zt_brief", Stage: "Qualification", Amount: 2500,
        Account_Name: { id: account!.id }, Contact_Name: { id: contact!.id },
        Closing_Date: "2026-11-30", Type: "New Business",
      });
      expect(String(deal!.Deal_Name)).toBe("Rosa's Tacos — Fall foot traffic — Oct 2026");
      const t = await prisma.syncTask.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } });
      expect(task).toMatchObject({
        SponsorX_ID: t.id, Status: "Not Started", Priority: "Normal",
        Send_Notification_Email: false, What_Id: { id: deal!.id }, $se_module: "Deals", Who_Id: { id: contact!.id },
      });

      /* Every create was an upsert carrying SponsorX_ID — the dedupe key. */
      const creates = zoho.writes.filter((w) => w.action === "insert");
      expect(creates.map((w) => w.module)).toEqual(["Accounts", "Contacts", "Deals", "Tasks"]);
      expect(creates.every((w) => w.op === "upsert" && typeof w.record.SponsorX_ID === "string")).toBe(true);

      /* Our rows now hold Zoho's ids and the sync markers. */
      const brief = await prisma.campaignBrief.findUniqueOrThrow({
        where: { id: "zt_brief" }, select: { zohoDealId: true, lastSyncOrigin: true, budget: true },
      });
      expect(brief.zohoDealId).toBe(deal!.id);
      expect(brief.lastSyncOrigin).toBe("SPONSORX");
    });

    it("a retried push, even one that lost our copy of Zoho's id, never makes a second record", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      /* The at-least-once case: a crash after Zoho accepted the write but
         before we stored its id. */
      await prisma.campaignBrief.update({ where: { id: "zt_brief" }, data: { zohoDealId: null, lastSyncHash: null } });
      await prisma.sponsor.update({ where: { id: "zt_sponsor" }, data: { zohoAccountId: null } });
      await jobs.handlePushDeal(deps(), { tenantId: T, briefId: "zt_brief" });
      await jobs.handlePushDeal(deps(), { tenantId: T, briefId: "zt_brief" });

      expect(zoho.all("Accounts")).toHaveLength(1);
      expect(zoho.all("Deals")).toHaveLength(1);
      const brief = await prisma.campaignBrief.findUniqueOrThrow({
        where: { id: "zt_brief" }, select: { zohoDealId: true, lastSyncOrigin: true, budget: true },
      });
      expect(brief.zohoDealId).toBe(zoho.all("Deals")[0]!.id);
    });

    it("SponsorX asserts only its own stages, and Amount only once contracted", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      await transitionBrief(actor, "zt_brief", "APPROVED");
      await drain();
      const dealId = String(zoho.all("Deals")[0]!.id);
      const approve = zoho.writes.at(-1)!;
      expect(approve).toMatchObject({ op: "update", module: "Deals", id: dealId });
      expect(approve.record).toEqual({ SponsorX_ID: "brief:zt_brief", Stage: "Proposal/Price Quote" });

      const campaign = await createCampaignFromBrief(actor, "zt_brief", "Rosa's Fall Push");
      await drain();
      expect(zoho.all("Deals")).toHaveLength(1); // the same Deal, won
      expect(zoho.writes.at(-1)!.record).toEqual({ SponsorX_ID: "brief:zt_brief", Stage: "Closed Won", Amount: 2500 });
      const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id }, select: { zohoDealId: true } });
      expect(c.zohoDealId).toBe(dealId);
    });

    it("submitting a campaign for approval raises the approval task on its Deal, owned by the mapped Zoho user", async () => {
      await prisma.user.update({ where: { id: "zt_user" }, data: { zohoUserId: "z_owner_1" } });
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await transitionBrief(actor, "zt_brief", "APPROVED");
      const campaign = await createCampaignFromBrief(actor, "zt_brief", "Rosa's Fall Push");
      await transitionCampaign(actor, campaign.id, "STAFFING");
      await transitionCampaign(actor, campaign.id, "APPROVAL");
      await drain();
      const approval = zoho.all("Tasks").find((t) => String(t.Subject).startsWith("Approve campaign"));
      expect(approval).toMatchObject({
        Subject: "Approve campaign: Rosa's Fall Push",
        What_Id: { id: zoho.all("Deals")[0]!.id },
        Owner: { id: "z_owner_1" },
      });
    });

    it("a brief closed from DRAFT gets no Deal invented for it", async () => {
      await transitionBrief(actor, "zt_brief", "CLOSED");
      expect(await drain()).toEqual([]);
      expect(zoho.all("Deals")).toHaveLength(0);
    });
  });

  describe("P8-INT-02 · a Zoho-originated write with an unchanged hash is dropped — the loop cannot start", () => {
    it("Zoho's notification of our own write is an echo, and applies nothing", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      const writes = zoho.writes.length;
      const outcomes = await deliverNotifications();
      expect(outcomes.length).toBeGreaterThanOrEqual(4);
      expect(outcomes.every((o) => o.status === "echo")).toBe(true);
      expect(zoho.writes.length).toBe(writes);
    });

    it("a sales edit is applied once, and pushing afterwards sends nothing back", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      await deliverNotifications();
      const accountId = String(zoho.all("Accounts")[0]!.id);

      zoho.humanEdit("Accounts", accountId, { Account_Name: "Rosa's Tacos LLC" });
      const [applied] = await deliverNotifications();
      expect(applied).toMatchObject({ status: "applied", entity: "Sponsor" });
      const s = await prisma.sponsor.findUniqueOrThrow({
        where: { id: "zt_sponsor" }, select: { name: true, lastSyncOrigin: true },
      });
      expect(s).toMatchObject({ name: "Rosa's Tacos LLC", lastSyncOrigin: "ZOHO" });

      const writes = zoho.writes.length;
      expect(await sync.pushAccount(ctx(), T, "zt_sponsor")).toMatchObject({ status: "echo" });
      /* And a second delivery of the same notification is not re-applied. */
      zoho.notifications.push({ module: "Accounts", id: accountId });
      expect((await deliverNotifications())[0]).toMatchObject({ status: "unchanged" });
      expect(zoho.writes.length).toBe(writes);
    });

    it("left to run, push → notify → apply settles instead of ping-ponging", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      zoho.humanEdit("Deals", String(zoho.all("Deals")[0]!.id), { Amount: 3100, Stage: "Negotiation/Review" });
      for (let round = 0; round < 5; round++) {
        await deliverNotifications();
        await drain();
        await sync.pushDeal(ctx(), T, { briefId: "zt_brief" });
      }
      expect(zoho.notifications).toHaveLength(0);
      /* Pre-contract, Amount is Zoho's: it was applied to the brief, and
         SponsorX did not revert sales' stage. */
      const brief = await prisma.campaignBrief.findUniqueOrThrow({
        where: { id: "zt_brief" }, select: { zohoDealId: true, lastSyncOrigin: true, budget: true },
      });
      expect(brief.budget).toBe(310_000);
      expect(zoho.all("Deals")[0]!.Stage).toBe("Negotiation/Review");
    });

    it("a field changed on both sides is settled by its SoR and the loser is audited", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      await deliverNotifications();
      await prisma.sponsor.update({ where: { id: "zt_sponsor" }, data: { name: "Rosa's (local edit)" } });
      zoho.humanEdit("Accounts", String(zoho.all("Accounts")[0]!.id), { Account_Name: "Rosa's Tacos LLC" });
      const [out] = await deliverNotifications();
      expect(out).toMatchObject({ status: "applied", conflicts: ["name"] });
      const row = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId: T, action: "sync.conflict" }, select: { before: true, after: true },
      });
      expect(row.before).toMatchObject({ field: "name", sponsorx: "Rosa's (local edit)" });
      expect(row.after).toMatchObject({ field: "name", zoho: "Rosa's Tacos LLC", winner: "ZOHO" });
    });

    it("a task completed in Zoho is completed here; tasks staff made in Zoho stay there", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      await deliverNotifications();
      zoho.humanEdit("Tasks", String(zoho.all("Tasks")[0]!.id), { Status: "Completed" });
      expect((await deliverNotifications())[0]).toMatchObject({ status: "applied", entity: "SyncTask" });
      expect((await prisma.syncTask.findFirstOrThrow({ where: { tenantId: T }, select: { completedAt: true } })).completedAt).not.toBeNull();

      const staffTask = zoho.seed("Tasks", { Subject: "Call the printer", Status: "Not Started" });
      expect(await sync.applyZohoRecord(ctx(), "Tasks", (await zoho.get("Tasks", staffTask))!))
        .toMatchObject({ status: "ignored" });
    });
  });

  describe("P8-INT-06 · inquiries create Zoho Leads; campaign closure creates a renewal Deal", () => {
    it("a sponsor enquiry becomes a Lead with a picklist value the org has", async () => {
      let status = 0;
      let body: Record<string, unknown> = {};
      const res = { status: (s: number) => ((status = s), res), json: (b: Record<string, unknown>) => void (body = b) };
      await submitInquiry(
        { ip: "127.0.0.1", body: { companyName: "Iron Path Gym", firstName: "Dee", lastName: "Marsh", email: "dee@ironpath.test", message: "Fall sponsorship?" } } as never,
        res as never,
        (() => {}) as never,
      );
      expect(status).toBe(201);
      expect(await drain()).toEqual(["zoho.pushLead"]);
      expect(zoho.all("Leads")[0]).toMatchObject({
        SponsorX_ID: body.id, Last_Name: "Marsh", First_Name: "Dee", Company: "Iron Path Gym",
        Email: "dee@ironpath.test", Description: "Fall sponsorship?", Lead_Source: "OnlineStore",
      });
      expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: String(body.id) }, select: { zohoLeadId: true } })).zohoLeadId)
        .toBe(zoho.all("Leads")[0]!.id);
    });

    it("a completed campaign opens a renewal Deal and a renewal task on it", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await transitionBrief(actor, "zt_brief", "APPROVED");
      const campaign = await createCampaignFromBrief(actor, "zt_brief", "Rosa's Fall Push");
      await drain();
      await prisma.campaign.update({ where: { id: campaign.id }, data: { state: "REPORTING" } });
      await transitionCampaign(actor, campaign.id, "COMPLETED");
      await drain();

      const renewal = zoho.bySponsorXId("Deals", `renewal:${campaign.id}`);
      expect(renewal).toMatchObject({ Stage: "Qualification", Amount: 2500, Type: "Existing Business" });
      expect(zoho.all("Deals")).toHaveLength(2);
      const task = zoho.all("Tasks").find((t) => String(t.Subject).startsWith("Renewal conversation"));
      expect(task).toMatchObject({ What_Id: { id: renewal!.id } });
      /* One-way: Zoho's renewal is never read back. */
      expect(await sync.applyZohoRecord(ctx(), "Deals", renewal!)).toMatchObject({ status: "ignored" });
    });
  });

  describe("P8-INT-05 · drift is detected and reported, never silently repaired", () => {
    it("reports lost pushes, unknown ids and divergence, and changes nothing", async () => {
      await transitionBrief(actor, "zt_brief", "QUALIFIED");
      await drain();
      await deliverNotifications();

      const clean = await sync.reconcile(ctx(), T);
      expect(clean.every((r) => !r.missingInZoho.length && !r.unknownInSponsorX.length && !r.diverged.length)).toBe(true);

      const dealId = String(zoho.all("Deals")[0]!.id);
      zoho.records.get("Deals")!.delete(dealId); // a lost Deal
      const ghost = zoho.seed("Accounts", { Account_Name: "Ghost Co", SponsorX_ID: "sponsor_from_elsewhere" });
      const contactId = String(zoho.all("Contacts")[0]!.id);
      zoho.records.get("Contacts")!.get(contactId)!.Email = "rosa@new.test"; // a missed webhook

      const reports = Object.fromEntries((await sync.reconcile(ctx(), T)).map((r) => [r.module, r]));
      expect(reports.Deals!.missingInZoho).toEqual(["brief:zt_brief"]);
      expect(reports.Accounts!.unknownInSponsorX).toEqual([ghost]);
      expect(reports.Contacts!.diverged).toEqual([{ key: "zt_contact", fields: ["Email"] }]);

      const rows = await prisma.zohoReconciliation.findMany({ where: { tenantId: T }, select: { id: true } });
      expect(rows).toHaveLength(8); // two runs × four modules
      /* Report only: neither side was touched. */
      expect((await prisma.sponsorContact.findUniqueOrThrow({ where: { id: "zt_contact" }, select: { email: true } })).email).toBe("rosa@rosas.test");
      expect(zoho.records.get("Deals")!.has(dealId)).toBe(false);
    });

    it("the nightly sweep runs once a day per tenant", async () => {
      await jobs.runReconciliation(deps(), { tenantIds: [T] });
      const first = await prisma.zohoReconciliation.count({ where: { tenantId: T } });
      expect(first).toBe(4);
      await jobs.runReconciliation(deps(), { tenantIds: [T] });
      expect(await prisma.zohoReconciliation.count({ where: { tenantId: T } })).toBe(first);
    });
  });

  describe("P8-INT-07 · the backfill imports as a job, and is kept to run again", () => {
    it("imports accounts, contacts and user mapping, writes our key back, and a re-run adds nothing", async () => {
      const king = zoho.seed("Accounts", { Account_Name: "King (Sample)" });
      zoho.seed("Accounts", { Account_Name: "Chapman (Sample)" });
      zoho.seed("Accounts", { Account_Name: "Other env", SponsorX_ID: "sponsor_in_production" });
      zoho.seed("Contacts", { First_Name: "Kris", Last_Name: "Marrier", Email: "kris@king.test", Account_Name: { id: king } });
      zoho.seed("Contacts", { Last_Name: "No Email", Account_Name: { id: king } });
      zoho.seed("Contacts", { Last_Name: "Orphan", Email: "o@x.test", Account_Name: { id: "999" } });
      zoho.users = [{ id: "z_u1", email: "OPS@btg.test" }];

      const first = await jobs.handleBackfill(deps(), { tenantId: T });
      const by = Object.fromEntries(first.map((r) => [r.module, r]));
      expect(by.Users).toMatchObject({ linked: 1 });
      expect(by.Accounts).toMatchObject({ seen: 3, created: 2 });
      expect(by.Accounts!.skipped[0]!.reason).toMatch(/another environment/);
      expect(by.Contacts).toMatchObject({ seen: 3, created: 1 });
      expect(by.Contacts!.skipped.map((s) => s.reason).sort()).toEqual(["its account is not a SponsorX sponsor", "no email address"]);

      const imported = await prisma.sponsor.findFirstOrThrow({ where: { tenantId: T, zohoAccountId: king }, select: { id: true } });
      expect(zoho.records.get("Accounts")!.get(king)!.SponsorX_ID).toBe(imported.id);
      const kris = await prisma.sponsorContact.findFirstOrThrow({
        where: { tenantId: T, sponsorId: imported.id }, select: { name: true, isPrimary: true },
      });
      expect(kris).toMatchObject({ name: "Kris Marrier", isPrimary: true });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: "zt_user" }, select: { zohoUserId: true } })).zohoUserId).toBe("z_u1");

      const writes = zoho.writes.length;
      const again = await jobs.handleBackfill(deps(), { tenantId: T });
      expect(again.reduce((n, r) => n + r.created + r.linked, 0)).toBe(0);
      expect(zoho.writes.length).toBe(writes);

      /* An imported sponsor then pushes nothing: Zoho already has it and
         our key. The first Deal for it dedupes onto that account. */
      expect(await sync.pushAccount(ctx(), T, imported.id)).toMatchObject({ status: "echo", zohoId: king });
    });
  });
});
