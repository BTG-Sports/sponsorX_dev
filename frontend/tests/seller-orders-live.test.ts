import { describe, expect, it } from "vitest";

import {
  closesOn, confirmBy, datesText, lineSummary, linkProblem, markControl, orderBadge, orderBanner, proofProblem, shareNote, shareUsd, trackSteps,
  type ApiSellerOrder,
} from "@/lib/seller-orders-live";

/* 2S4-FE-03 / 2S4-FE-04 — the seller's Orders page: what it derives from GET /sales. */

/** A line as GET /sales returns it — the design's own order (SX-BAY6NFY3). */
const base: ApiSellerOrder = {
  id: "line-1", orderId: "ord-1", ref: "SX-BAY6NFY3", state: "IN_DELIVERY", orderState: "PAID",
  sponsor: { name: "Harbor Coffee", contact: { name: "Dana Brooks", email: "dana@harbor.example", phone: null } },
  line: {
    title: "Youth basketball clinic with Riley Carter", quantity: 2, unit: "session", unitPriceCents: 50_000,
    startsOn: "2026-10-10T12:00:00.000Z", endsOn: "2026-10-17T12:00:00.000Z", dates: ["2026-10-10", "2026-10-17"],
    soldBy: "Westfield Hawks", athlete: "Riley Carter",
  },
  shareCents: 60_424, placedAt: "2026-10-01T14:05:00.000Z", paidAt: "2026-10-01T14:06:00.000Z",
  markedAt: null, markedBy: null, deliveryNote: null, proof: { photo: false, link: null }, confirmDueAt: null,
  confirmedAt: null, confirmedBy: null, problem: null, resolution: null, overdue: false, canMarkDelivered: true,
};
const marked: ApiSellerOrder = { ...base, state: "DELIVERED", markedAt: "2026-09-30T19:40:00.000Z", confirmDueAt: "2026-10-01T19:40:00.000Z", markedBy: "Riley Carter", deliveryNote: "Held." };

describe("the agreed rules", () => {
  it("the sponsor has 24 hours to confirm; a confirmed line closes 30 days on", () => {
    expect(confirmBy("2026-10-17T19:40:00.000Z")).toBe("2026-10-18T19:40:00.000Z");
    expect(closesOn("2026-09-20T09:30:00.000Z")).toBe("2026-10-20T09:30:00.000Z");
  });
  it("the waiting banner gives the API's deadline and says no answer counts as confirmed", () => {
    const b = orderBanner(marked)!;
    expect(b.tone).toBe("warn");
    expect(b.text).toMatch(/Oct 1, 7:40 pm UTC/);
    expect(b.text).toMatch(/counts as confirmed/);
  });
  it("says who confirmed: the sponsor, silence, or BTG", () => {
    const c = { ...base, state: "CONFIRMED" as const, confirmedAt: "2026-10-02T00:00:00.000Z" };
    expect(orderBanner({ ...c, confirmedBy: "SPONSOR" })!.title).toBe("Confirmed by Harbor Coffee ✓");
    expect(orderBanner({ ...c, confirmedBy: "NO_ANSWER" })!.title).toMatch(/didn’t answer in 24 hours/);
    expect(orderBanner({ ...c, confirmedBy: "BTG", resolution: { decision: "CONFIRMED", note: "Both held.", at: null } })).toMatchObject({ title: "Confirmed by BTG ✓", quote: "BTG: “Both held.”" });
  });
  it("a refunded line says there's no share to pay", () => {
    expect(orderBanner({ ...base, state: "REFUNDED" })!.text).toMatch(/no share to pay out/);
  });
});

describe("each seller sees only their own share", () => {
  it("shows the share with cents", () => {
    expect(shareUsd(base.shareCents)).toBe("$604.24");
  });
  it("says where the other share lives", () => {
    expect(shareNote("athlete", true)).toMatch(/team’s share is on their own Orders page/);
    expect(shareNote("team", true)).toMatch(/Each athlete’s share/);
  });
});

describe("words", () => {
  it("summarises the line and its days", () => {
    expect(lineSummary(base.line)).toBe("2 sessions × $500");
    expect(datesText(base.line.dates)).toBe("Oct 10 and Oct 17");
    expect(datesText(["2026-10-10", "2026-10-17", "2026-10-24"])).toBe("Oct 10, Oct 17 and Oct 24");
  });
  it("every state is in words, not colour alone", () => {
    expect(orderBadge(base).label).toBe("In delivery");
    expect(orderBadge(marked).label).toBe("Waiting for Harbor Coffee");
    expect(orderBadge({ ...base, state: "UNPAID" }).mark).toBe("○");
    expect(orderBadge({ ...base, state: "REFUNDED" }).label).toBe("Refunded");
  });
  it("Mark delivered applies only while in delivery, with a reason otherwise", () => {
    expect(markControl({ state: "IN_DELIVERY" }).applies).toBe(true);
    expect(markControl({ state: "UNPAID" })).toEqual({ applies: false, why: "You can mark it delivered once it’s paid" });
    expect(markControl({ state: "PROBLEM" }).why).toBe("BTG is deciding this line");
  });
  it("the track marks the current step", () => {
    expect(trackSteps(base).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    const problem = trackSteps({ ...marked, state: "PROBLEM", problem: { reportedAt: "2026-10-01T00:00:00.000Z", text: "x" } });
    expect(problem[3]).toMatchObject({ state: "current", note: "Problem reported", tone: "danger" });
    expect(trackSteps({ ...marked, state: "CONFIRMED", confirmedAt: "2026-10-01T10:00:00.000Z" }).every((s) => s.state === "done")).toBe(true);
  });
  it("checks the photo and the link before anything is sent", () => {
    expect(proofProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(proofProblem({ type: "image/gif", size: 1000 })).toMatch(/JPEG or PNG/);
    expect(proofProblem({ type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(linkProblem("")).toBeNull();
    expect(linkProblem("https://instagram.com/p/1")).toBeNull();
    expect(linkProblem("http://instagram.com/p/1")).toMatch(/https/);
    expect(linkProblem("not a link")).toMatch(/isn't a link/);
  });
});

describe("apiRefusal (2S4-FE-05 review)", async () => {
  const { apiRefusal } = await import("../src/lib/seller-orders-live");
  it("a bare 403 means the line isn't theirs; a coded 403 (a minor's guardian must act) says why", () => {
    expect(apiRefusal(403, { error: { code: "forbidden", message: "x" } }, "Couldn't save")).toBe("Only this line’s own seller can do that.");
    expect(apiRefusal(403, null, "Couldn't save")).toBe("Only this line’s own seller can do that.");
    expect(apiRefusal(403, { error: { code: "guardian_must_act", message: "Jordan's guardian answers this for them." } }, "Couldn't save"))
      .toBe("Jordan's guardian answers this for them.");
  });
});
