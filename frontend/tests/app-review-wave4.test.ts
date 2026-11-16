import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { explainInventoryRefusal, inventoryConfirmHref } from "@/lib/inventory-live";
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
    expect(src("app/(app)/athlete/profile/page.tsx")).not.toContain('<span className="font-medium text-text">Request Partnership</span>');
    expect(src("app/(app)/athlete/orders/page.tsx")).toContain('action={{ label: "Open offers", href: "/athlete/offers" }}');
    expect(src("lib/profile-live.ts")).toContain('rates: "not-collected",');
  });
});

describe("POL-FE-70 · an applicant asked for changes can make them", () => {
  it("/join/edit reads their application on the email's token, shows BTG's note, and sends it back", () => {
    const page = src("app/(public)/join/edit/page.tsx");
    expect(page).toContain("/api/v1/applications/intake/mine?token=${encodeURIComponent(token)}");
    expect(page).toContain("What BTG asked you to change");
    expect(src("app/(public)/join/edit/actions.ts")).toContain('method: "PATCH"');
    expect(src("components/application-edit-form.tsx")).toContain("Send it back to BTG");
  });
});

describe("POL-FE-68/69 leftovers · confirmations, versions and page names", () => {
  const rules = { error: { code: "rules_attestation_required", message: "Confirm your rules first." } };
  const collab = { error: { code: "collab_agreement_required", message: "Accept the agreement first." } };

  it("an offer refused for a missing confirmation says which, and links to Confirmations", () => {
    const r = explainOfferRefusal(409, rules, "/athlete/offers/o1");
    expect(r.reload).toBe(false);
    expect(r.message).toMatch(/school, league and local rules/);
    expect(r.confirmHref).toBe("/athlete/confirmations?return=%2Fathlete%2Foffers%2Fo1");
    expect(explainOfferRefusal(409, collab).message).toMatch(/Content Collaboration Agreement/);
    expect(src("components/offer-respond.tsx")).toContain("error.confirmHref &&");
  });

  it("a new item refused for a missing confirmation says so — not 'until your profile is approved'", () => {
    expect(explainInventoryRefusal("create", 409, rules)).toMatch(/Before you add an item, confirm/);
    expect(explainInventoryRefusal("create", 409, collab)).toMatch(/Content Collaboration Agreement/);
    expect(inventoryConfirmHref(409, rules)).toBe("/athlete/confirmations?return=%2Fathlete%2Finventory");
    expect(inventoryConfirmHref(409, { error: { code: "other" } })).toBeNull();
    expect(src("components/inventory-form.tsx")).toContain("message.confirmHref &&");
  });

  it("an athlete can open each version they uploaded", () => {
    expect(src("app/(app)/athlete/deliverables/[id]/page.tsx")).toContain("<OpenVersionButton id={d.id} version={a.version} link={versionLinkAction} />");
    expect(src("app/(app)/athlete/deliverables/[id]/actions.ts")).toContain("/assets/${version}/url");
  });

  it("one name per page, and Confirmations has a permanent link under Account", () => {
    expect(src("components/seller-orders.tsx")).toContain('<ArenaHead title="Sales"');
    expect(src("lib/seller-orders-live.ts")).not.toContain("My money");
    expect(src("app/(app)/athlete/layout.tsx")).toContain('{ href: "/athlete/confirmations", label: "Confirmations"');
  });
});
