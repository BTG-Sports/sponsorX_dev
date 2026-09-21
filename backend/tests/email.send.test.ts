import { describe, expect, it, vi } from "vitest";

import { athleteNotificationKey, send, type EmailMessage } from "../src/lib/email";
import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";

/* --------------------------------------------------------------------------
   The email send interface — P3-INT-01, G-04, Addendum A1.

   Two properties are worth testing and one is not.

   Worth testing: that a send becomes a *queued job* rather than a vendor
   call, and that every message carries an idempotency key. Both are the
   acceptance, and both are the difference between an approval email that
   retries and one that vanishes when Resend has a bad minute.

   Not worth testing: that Resend sends email. That is Resend's test suite,
   and asserting it here would only prove the mock was called.
   -------------------------------------------------------------------------- */

/** A transaction stand-in that records what would have been written. */
function recordingTx() {
  const rows: Array<{ name: string; payload: Record<string, unknown> }> = [];
  return {
    rows,
    outboxJob: {
      create: ({ data }: { data: { name: string; payload: Record<string, unknown> } }) => {
        rows.push({ name: data.name, payload: data.payload });
        return Promise.resolve({ id: "job_1" });
      },
    },
  };
}

const message: EmailMessage = {
  template: "athlete.approved",
  to: "athlete@example.com",
  data: { firstName: "Shammah", portalUrl: "https://sponsorx.net/athlete" },
  idempotencyKey: "athlete.approved:ath_1:1",
};

describe("send()", () => {
  it("queues a job instead of calling a vendor", async () => {
    const tx = recordingTx();
    await send(tx as never, "tenant_1", message);

    expect(tx.rows).toHaveLength(1);
    expect(tx.rows[0]?.name).toBe("notify.email");
  });

  it("carries the tenant inside the payload, not only on the row", async () => {
    /* The drain hands pg-boss the payload alone, so a handler that needs the
       tenant has no other way to see it. */
    const tx = recordingTx();
    await send(tx as never, "tenant_1", message);
    expect(tx.rows[0]?.payload).toMatchObject({ tenantId: "tenant_1" });
  });

  it("refuses a message with no idempotency key", async () => {
    const tx = recordingTx();
    await expect(
      send(tx as never, "tenant_1", { ...message, idempotencyKey: "" }),
    ).rejects.toThrow(/idempotencyKey/);
    expect(tx.rows).toHaveLength(0);
  });

  it("does not put the message body in the queue payload", async () => {
    /* The payload is stored in an outbox row. §26: personal data should not
       accumulate where nobody thinks to look, so the template is named and
       rendered at send time rather than carried as prose. */
    const tx = recordingTx();
    await send(tx as never, "tenant_1", message);
    expect(JSON.stringify(tx.rows[0]?.payload)).not.toContain("welcome to the SponsorX");
  });
});

describe("idempotency keys", () => {
  it("are stable for the same event and different across events", () => {
    const a = athleteNotificationKey("athlete.approved", "ath_1", 1);
    const b = athleteNotificationKey("athlete.approved", "ath_1", 1);
    const c = athleteNotificationKey("athlete.approved", "ath_2", 1);
    const d = athleteNotificationKey("athlete.rejected", "ath_1", 1);

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("let the same notification recur when it genuinely should", () => {
    /* Re-approving after a suspension is a new event, not a duplicate. The
       occurrence component is what distinguishes them. */
    expect(athleteNotificationKey("athlete.approved", "ath_1", 1)).not.toBe(
      athleteNotificationKey("athlete.approved", "ath_1", 2),
    );
  });

  it("are not time-based, which is the bug the field exists to prevent", () => {
    const first = athleteNotificationKey("athlete.approved", "ath_1", 1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01"));
    const later = athleteNotificationKey("athlete.approved", "ath_1", 1);
    vi.useRealTimers();
    expect(later).toBe(first);
  });
});

describe("templates", () => {
  it("exist for every message the domain can send", () => {
    /* A template name that is a typo silently never sends, and nobody
       notices until an athlete says they were never told. */
    const declared = [
      "athlete.applicationReceived",
      "athlete.approved",
      "athlete.changesRequested",
      "athlete.rejected",
      "guardian.verificationRequested",
    ];
    for (const name of declared) {
      expect(EMAIL_TEMPLATES[name], `no template for ${name}`).toBeTypeOf("function");
    }
  });

  it("render without throwing when optional data is absent", () => {
    /* Every one of these goes to a real person. A missing first name should
       produce a slightly impersonal email, never a crashed job. */
    for (const [name, build] of Object.entries(EMAIL_TEMPLATES)) {
      const rendered = build({});
      expect(rendered.subject, name).toBeTruthy();
      expect(rendered.text, name).toBeTruthy();
      expect(rendered.text, `${name} leaked "undefined"`).not.toContain("undefined");
    }
  });

  it("tells a rejected applicant it is not necessarily permanent", () => {
    /* Tone is part of the product here: these athletes are teenagers, and
       the network wants them to reapply. */
    expect(EMAIL_TEMPLATES["athlete.rejected"]?.({}).text).toContain("not necessarily permanent");
  });
});
