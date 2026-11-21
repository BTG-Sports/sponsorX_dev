/* POL-FE-118 — /portal speaks about what a signed-in address applied for,
   instead of telling someone who just applied to apply. */
import { describe, expect, it } from "vitest";

import { pendingWords } from "@/lib/pending-words";

const sponsor = (over: Partial<{ state: string; missing: string[]; underReview: boolean }> = {}) => ({
  kind: "sponsor" as const, state: "NEW", businessName: "Mosha Outfitters", missing: [] as string[], underReview: false,
  statusPath: "/sponsor-request/tok", ...over,
});

describe("POL-FE-118 · the sign-in page's words for an application with no login yet", () => {
  it("nothing applied for: no special words (the page keeps its plain refusal)", () => {
    expect(pendingWords(null)).toBeNull();
    expect(pendingWords(undefined)).toBeNull();
  });

  it("a brief waiting for its proof names the business, says the email is confirmed, and links the upload", () => {
    const w = pendingWords(sponsor({ missing: ["confirm your email", "upload your proof of business"] }))!;
    expect(w.heading).toBe("Your sponsor request is almost ready");
    expect(w.lead).toMatch(/Mosha Outfitters is in, and signing in has confirmed your email/);
    expect(w.todo).toEqual(["Upload your proof of business."]); // the sign-in already confirmed the email
    expect(w.action).toEqual({ href: "/sponsor-request/tok", label: "Upload your proof of business" });
    expect(JSON.stringify(w)).not.toMatch(/Get started|apply/i);
  });

  it("everything in: BTG is checking it, with the request page", () => {
    const w = pendingWords(sponsor({ underReview: true }))!;
    expect(w.heading).toBe("BTG is checking your sponsor request");
    expect(w.after).toMatch(/email you when your account is ready/);
    expect(w.action).toEqual({ href: "/sponsor-request/tok", label: "See your request" });
  });

  it("a declined request and a closed account say so", () => {
    expect(pendingWords(sponsor({ state: "DECLINED" }))!.heading).toBe("Your sponsor request wasn’t approved");
    const closed = pendingWords(sponsor({ state: "REJECTED" }))!;
    expect(closed.heading).toBe("This sponsor account is closed");
    expect(closed.action).toBeUndefined();
  });

  it("an athlete applicant is told where the application stands, with the application", () => {
    const at = (state: string) => pendingWords({ kind: "athlete", state, displayName: "Neema" })!;
    expect(at("SUBMITTED")).toMatchObject({ heading: "Your application is with BTG", action: { href: "/join/apply" } });
    expect(at("UNDER_REVIEW").heading).toBe("Your application is with BTG");
    expect(at("DRAFT")).toMatchObject({ heading: "Your application isn’t finished", action: { label: "Finish your application" } });
    expect(at("CHANGES_REQUESTED")).toMatchObject({ heading: "BTG asked for changes", action: { label: "See what to change" } });
    expect(at("REJECTED").action).toBeUndefined();
  });
});
