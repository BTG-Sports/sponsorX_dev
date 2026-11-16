import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { adjustmentProblem, dollarsToCents, earningMoves, earningRefusal, mayActOnEarnings, mayAdjust, referenceProblem } from "@/lib/earning-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/finance/(treasury)/actions", () => ({ moveEarningAction: vi.fn(), adjustEarningAction: vi.fn() }));

/* POL-FE-53 (app review B2) — campaign earnings could never be approved or
   paid. Done when: Finance takes an earning Eligible → Approved → Paid, holds
   and releases one, and adjusts one with a reason, from the Finance books.
   (Legal moves and who may are the API's — earning-state.ts, policy.ts.) */

describe("the moves on an earning", () => {
  it("Approve from Eligible, Mark paid (with a reference) from Approved, Release from Held; Hold from the open states", () => {
    expect(earningMoves("ELIGIBLE").map((m) => m.label)).toEqual(["Approve", "Hold"]);
    expect(earningMoves("APPROVED_FOR_PAYOUT")).toEqual([
      { to: "PAID", label: "Mark paid", needsReference: true, primary: true }, { to: "HELD", label: "Hold" },
    ]);
    /* POL-FE-87 — a hold goes back to pending (the API releases to payable only verified work), and pending can be voided. */
    expect(earningMoves("HELD").map((m) => [m.to, m.label])).toEqual([["ELIGIBLE", "Release"], ["PENDING", "Back to pending"]]);
    expect(earningMoves("PENDING").map((m) => [m.to, m.label, Boolean(m.needsConfirm)])).toEqual([["HELD", "Hold", false], ["VOIDED", "Void", true]]);
    expect(earningMoves("PAID")).toEqual([]);
    expect(earningMoves("VOIDED")).toEqual([]);
  });

  it("an adjustment only before approval; dollars to cents, signed; a reference and a reason are required", () => {
    expect(["PENDING", "ELIGIBLE", "HELD", "DISPUTED"].every(mayAdjust)).toBe(true);
    expect(mayAdjust("APPROVED_FOR_PAYOUT")).toBe(false);
    expect(dollarsToCents("-12.50")).toBe(-1250);
    expect(dollarsToCents("$1,000")).toBe(100_000);
    expect(dollarsToCents("0")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(referenceProblem(" ")).toMatch(/transfer reference/);
    expect(adjustmentProblem("25", " ")).toMatch(/Say why/);
    expect(adjustmentProblem("25", "Late post")).toBeNull();
  });

  it("only Finance and SUPER_ADMIN act; BTG admins read", () => {
    expect(mayActOnEarnings(["FINANCE"])).toBe(true);
    expect(mayActOnEarnings(["SUPER_ADMIN"])).toBe(true);
    expect(mayActOnEarnings(["BTG_ADMIN"])).toBe(false);
    expect(earningRefusal(403, null)).toBe("Only Finance approves and pays earnings.");
  });
});

describe("in Finance's books", () => {
  it("each row draws its buttons", async () => {
    const { EarningRowActions } = await import("@/components/earning-row-actions");
    const html = renderToStaticMarkup(createElement(EarningRowActions, { id: "e1", state: "ELIGIBLE" }));
    expect(html).toContain(">Approve</button>");
    expect(html).toContain(">Hold</button>");
    expect(html).toContain(">Adjust</button>");
    expect(renderToStaticMarkup(createElement(EarningRowActions, { id: "e1", state: "PAID" }))).toContain("—");
  });

  it("the books show the Action column to Finance, through the two existing routes", () => {
    const page = readFileSync(new URL("../src/app/(app)/finance/(treasury)/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/canAct: mayActOnEarnings\(who\.actor\.roles\)/);
    expect(page).toMatch(/canAct=\{t\.canAct\}/);
    const actions = readFileSync(new URL("../src/app/(app)/finance/(treasury)/actions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/\/earnings\/\$\{encodeURIComponent\(id\)\}\/transition/);
    expect(actions).toMatch(/\/earnings\/\$\{encodeURIComponent\(id\)\}\/adjustment/);
  });
});

describe("POL-FE-87 · Back to pending and Void", () => {
  it("say what happened, and Void asks first", async () => {
    const { earningMovedLine } = await import("@/lib/earning-actions");
    expect(earningMovedLine("PENDING")).toMatch(/^Back to pending/);
    expect(earningMovedLine("VOIDED")).toBe("Voided — nothing is owed on it.");
    const row = readFileSync(new URL("../src/components/earning-row-actions.tsx", import.meta.url), "utf8");
    expect(row).toContain('m.needsConfirm ? setForm(form === "void" ? null : "void")');
    expect(row).toContain('moveEarningAction(id, "VOIDED")');
    const actions = readFileSync(new URL("../src/app/(app)/finance/(treasury)/actions.ts", import.meta.url), "utf8");
    expect(actions).toContain('"PENDING", "VOIDED"]');
  });
});
