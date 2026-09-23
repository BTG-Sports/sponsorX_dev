/**
 * P7-BE-01 — "PENDING→ELIGIBLE→APPROVED_FOR_PAYOUT→PAID/HELD/DISPUTED
 * enforced; no tax ID field, no bank details."
 *
 * Both halves are testable and both are tested. All 36 ordered pairs are
 * asserted, and the second clause is checked against the Prisma schema and
 * the published contract — because "no tax ID" is a promise about a shape,
 * and a shape can be checked.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canTransitionEarning,
  EARNING_STATES,
  IllegalEarningTransitionError,
  isEarningMutable,
  legalEarningTransitions,
  type EarningState,
} from "../src/domain/earning-state";

/** Written out independently of the implementation. */
const LEGAL: Record<EarningState, EarningState[]> = {
  PENDING: ["ELIGIBLE", "HELD", "DISPUTED"],
  ELIGIBLE: ["APPROVED_FOR_PAYOUT", "HELD", "DISPUTED"],
  APPROVED_FOR_PAYOUT: ["PAID", "HELD", "DISPUTED"],
  HELD: ["PENDING", "ELIGIBLE", "DISPUTED"],
  DISPUTED: ["ELIGIBLE", "HELD"],
  PAID: [],
};

describe("the earning lifecycle", () => {
  it("has exactly the six §21 states", () => {
    expect([...EARNING_STATES]).toEqual([
      "PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED",
    ]);
  });

  it.each(
    EARNING_STATES.flatMap((from) =>
      EARNING_STATES.map((to) => ({ from, to, legal: LEGAL[from].includes(to) })),
    ),
  )("$from → $to is $legal", ({ from, to, legal }) => {
    expect(canTransitionEarning(from, to)).toBe(legal);
  });

  it("walks PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID", () => {
    const path: EarningState[] = [
      "PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID",
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionEarning(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  /* Completing work must not authorise money by itself — a person in Finance
     stands between ELIGIBLE and APPROVED_FOR_PAYOUT. */
  it("never skips the approval step", () => {
    expect(canTransitionEarning("ELIGIBLE", "PAID")).toBe(false);
    expect(canTransitionEarning("PENDING", "PAID")).toBe(false);
    expect(canTransitionEarning("PENDING", "APPROVED_FOR_PAYOUT")).toBe(false);
  });

  /* A dispute is raised precisely so the amount is NOT paid while it stands. */
  it("never pays a disputed earning", () => {
    expect(canTransitionEarning("DISPUTED", "PAID")).toBe(false);
    expect(canTransitionEarning("DISPUTED", "APPROVED_FOR_PAYOUT")).toBe(false);
  });

  it("PAID is terminal — the transfer left the bank", () => {
    expect(legalEarningTransitions("PAID")).toEqual([]);
  });

  it("a hold returns to the queue rather than skipping ahead", () => {
    expect(canTransitionEarning("HELD", "PENDING")).toBe(true);
    expect(canTransitionEarning("HELD", "ELIGIBLE")).toBe(true);
    expect(canTransitionEarning("HELD", "APPROVED_FOR_PAYOUT")).toBe(false);
    expect(canTransitionEarning("HELD", "PAID")).toBe(false);
  });

  it("HELD and DISPUTED are reachable from every live state", () => {
    for (const s of ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT"] as EarningState[]) {
      expect(canTransitionEarning(s, "HELD")).toBe(true);
      expect(canTransitionEarning(s, "DISPUTED")).toBe(true);
    }
  });
});

describe("the amount can only change while the money has not moved", () => {
  it.each(EARNING_STATES)("%s", (state) => {
    const expected = ["PENDING", "ELIGIBLE", "HELD", "DISPUTED"].includes(state);
    expect(isEarningMutable(state)).toBe(expected);
  });
});

/**
 * The second clause of the acceptance, checked as a shape rather than
 * trusted as an intention.
 */
describe("no tax ID, no bank details — §26 and Addendum A6", () => {
  const schema = readFileSync(
    new URL("../prisma/schema.prisma", import.meta.url),
    "utf8",
  );
  const earningModel = schema.slice(
    schema.indexOf("model Earning {"),
    schema.indexOf("}", schema.indexOf("model Earning {")),
  );

  it.each([
    "taxId", "tax_id", "ssn", "ein",
    "bankAccount", "accountNumber", "routingNumber", "iban", "sortCode",
  ])("the Earning model has no %s field", (field) => {
    expect(earningModel.toLowerCase()).not.toContain(field.toLowerCase());
  });

  it("the whole schema has no bank detail column anywhere", () => {
    for (const field of ["accountNumber", "routingNumber", "iban", "sortCode"]) {
      expect(schema.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  /* `reference` is a pointer to a Zoho or bank record — not a credential,
     and not enough to move anything. It is allowed, and named, on purpose. */
  it("keeps `reference`, which is a pointer rather than a credential", () => {
    expect(earningModel).toContain("reference");
  });

  it("the published contract exposes no tax or bank field either", () => {
    const contract = readFileSync(
      new URL("../src/contracts/earning.ts", import.meta.url),
      "utf8",
    );
    for (const field of ["taxId", "bankAccount", "routingNumber", "iban"]) {
      expect(contract.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });
});

describe("the refusal explains itself", () => {
  it("names both states and the legal moves", () => {
    const err = new IllegalEarningTransitionError("PENDING", "PAID");
    expect(err.status).toBe(409);
    expect(err.message).toContain("PENDING");
    expect(err.message).toContain("ELIGIBLE");
  });

  it("says so when the state is terminal", () => {
    expect(new IllegalEarningTransitionError("PAID", "ELIGIBLE").message)
      .toContain("terminal");
  });
});
