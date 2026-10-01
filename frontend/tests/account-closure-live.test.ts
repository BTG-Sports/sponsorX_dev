import { describe, expect, it } from "vitest";

import { reactivateDemo, reactivateView, sampleReactivation, type ApiReactivationStatus } from "@/lib/account-closure-live";

/* 2S1-FE-08 (close / reactivate half) — the words the public reactivation page derives from GET /public/account/reactivation/:token. */

const now = new Date("2026-10-01T12:00:00.000Z");

describe("reactivating", () => {
  it("a self-closed account counts its 30 days and can come back", () => {
    const v = reactivateView(sampleReactivation("CLOSED_SELF", "Riley", now));
    expect(v.kind).toBe("self");
    if (v.kind !== "self") return;
    expect(v.left).toBe("23 days left");
    expect(v.headline).toBe("Riley, your account closed on Sep 24.");
    expect(v.body).toMatch(/^Reactivate by Oct 24/);
  });

  it("an account closed by BTG can't reactivate itself — it asks BTG, and says when it did", () => {
    const s = sampleReactivation("CLOSED_BY_BTG", "Riley", now);
    const v = reactivateView(s);
    expect(v.kind).toBe("btg");
    if (v.kind !== "btg") return;
    expect(v.body).toMatch(/can’t reactivate it yourself/);
    expect(v.kept).toBe("Your documents are kept until Oct 24, then deleted.");
    expect(v.asked).toBeNull();
    const asked = reactivateView({ ...s, requestedAt: "2026-09-28T09:00:00.000Z" });
    expect(asked.kind === "btg" && asked.asked).toBe("You asked BTG on Sep 28. A person at BTG will reply by email.");
    const no = reactivateView({ ...s, requestedAt: "2026-09-28T09:00:00.000Z", requestDeclined: true });
    expect(no.kind === "btg" && no.asked).toMatch(/replied by email/);
  });

  it("an account ended at coming of age comes back by the government ID, not by asking BTG", () => {
    const base = { ...sampleReactivation("CLOSED_BY_BTG", "Jordan", now), standing: "CLOSED_AT_AGE" as const };
    const athlete = reactivateView({ ...base, comingOfAgePath: "/coming-of-age/tok" });
    expect(athlete.kind).toBe("age");
    if (athlete.kind !== "age") return;
    expect(athlete.uploadPath).toBe("/coming-of-age/tok");
    expect(athlete.body).toBe("Upload your government ID by Oct 24 and your account comes back — no need to ask BTG.");
    expect(athlete.kept).toBe("Your documents are kept until Oct 24, then deleted.");
    /* No link of their own (closed with the guardian's address): the email's link. */
    const noLink = reactivateView(base);
    expect(noLink.kind === "age" && noLink.uploadPath).toBeNull();
    expect(noLink.kind === "age" && noLink.body).toMatch(/from the coming-of-age link we emailed you/);
    /* The guardian: nothing to reactivate; the athlete uploads. */
    const guardian = reactivateView({ ...base, kind: "GUARDIAN", greeting: "Pat", comingOfAgePath: "/coming-of-age/tok" });
    expect(guardian.kind === "age" && guardian.uploadPath).toBeNull();
    expect(guardian.kind === "age" && guardian.body).toMatch(/^There’s nothing to reactivate here\. Your athlete can bring their own account back/);
    expect(JSON.stringify([athlete, noLink, guardian])).not.toMatch(/Ask BTG to review/);
  });

  it("after 30 days the files are gone: sign up again; once back, the re-run checks are shown", () => {
    const base: ApiReactivationStatus = sampleReactivation("CLOSED_SELF", "Riley", now);
    expect(reactivateView({ ...base, standing: "EXPIRED" })).toMatchObject({ kind: "expired", body: /sign up again/ });
    expect(reactivateView({ ...base, standing: "REACTIVATED", recheckNotes: ["Everything checked out."] }))
      .toEqual({ kind: "back", badge: "Active again", headline: "Riley, your account is back.", notes: ["Everything checked out."] });
  });

  it("only two previews exist", () => {
    expect(reactivateDemo("self")).toBe("self");
    expect(reactivateDemo(["btg"])).toBe("btg");
    expect(reactivateDemo("other")).toBeNull();
  });
});
