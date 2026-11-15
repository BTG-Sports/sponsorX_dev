import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { explainInventoryRefusal } from "@/lib/inventory-live";
import { explainOfferRefusal } from "@/lib/offer-live";

/* App review wave 4 — athletes and guardians. */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-68 · a minor's and a guardian's screens tell the truth", () => {
  const minor = { error: { code: "guardian_must_act", message: "Your guardian answers this for you, from their own login." } };
  it("a minor's refusal is said as the API said it, not a false reason", () => {
    expect(explainOfferRefusal(403, minor).message).toBe("Your guardian answers this for you, from their own login.");
    expect(explainInventoryRefusal("create", 403, minor)).toBe("Your guardian answers this for you, from their own login.");
    expect(explainInventoryRefusal("create", 403, null)).toMatch(/isn't linked to an athlete profile/);
    expect(src("app/(app)/athlete/listings/actions.ts")).toContain("?.error?.message ?? \"Only you can list your own items");
  });

  it("a minor's own login sees that their guardian accepts the order, not an Accept that fails", async () => {
    const { acceptBlocker } = await import("@/lib/order-live");
    const o = { state: "SENT", agreement: { body: "x" }, guardian: { status: "verified", name: "Pat" } } as unknown as Parameters<typeof acceptBlocker>[0];
    expect(acceptBlocker(o, true, true)).toBe("Pat accepts this order for you, from their own login.");
    expect(acceptBlocker(o, true, false)).toBeNull();
  });

  it("the guardian's seat reads Guardian; the notice is on every page; a minor reaches Guardian requests", () => {
    const layout = src("app/(app)/athlete/layout.tsx");
    expect(layout).toContain('actor.roles.includes("GUARDIAN") ? "Guardian"');
    expect(layout).toContain("<GuardianControlNotice actor={actor} />");
    expect(layout).toContain("|| Boolean(actor.guardianControl))");
    expect(src("app/(app)/athlete/page.tsx")).not.toContain("<GuardianControlNotice");
  });
});

describe("POL-FE-69 · athlete orders, earnings and profile say true things", async () => {
  const { STATUS_DETAIL } = await import("@/lib/earnings-ui");
  it("earnings: campaign pay is BTG Finance's; after accepting it's the athlete's turn; no sample payout day", () => {
    expect(src("app/(app)/athlete/earnings/page.tsx")).toContain("Campaign earnings are paid by BTG Finance; shop and marketplace sales go to your payout account on Stripe");
    expect(STATUS_DETAIL.PENDING).toMatch(/once your deliverables are posted and verified/);
    expect(STATUS_DETAIL.APPROVED_FOR_PAYOUT).not.toMatch(/payout run/);
    expect(src("components/activity-explorer.tsx")).not.toContain(", 2026");
    expect(src("components/activity-explorer.tsx")).not.toContain("heldNote");
  });

  it("invitations and profile say BTG matches and invites; orders point to Offers; rates leave the completion", () => {
    expect(src("app/(app)/athlete/invitations/page.tsx")).toContain("BTG matches athletes to sponsors' campaigns and sends the invitations");
    expect(src("app/(app)/athlete/profile/page.tsx")).not.toContain("Request Partnership");
    expect(src("app/(app)/athlete/orders/page.tsx")).toContain('action={{ label: "Open offers", href: "/athlete/offers" }}');
    expect(src("lib/profile-live.ts")).toContain('rates: "not-collected",');
  });
});
