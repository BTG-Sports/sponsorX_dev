import { describe, expect, it } from "vitest";

import {
  SLOT_RACK_CENTS,
  clearanceQueue,
  contentRights,
  editionBackCover,
  editionReaderArticles,
  studentApplications,
  editionPages,
  editionSplits,
  studentEdition,
  studentProspects,
  studentSales,
  type EditionSlot,
} from "../src/lib/fixtures";

/* --------------------------------------------------------------------------
   P1-FE-21 — the flatplan is the single source for the edition's numbers.
   The student portal's edition card and the admin page map render different
   projections of the same inventory; these invariants are what stop the two
   surfaces telling different stories before Stage 9 wires the real AdSlot
   table under both.
   -------------------------------------------------------------------------- */

const allSlots: EditionSlot[] = [
  ...editionPages.flatMap((p) => p.slots),
  editionBackCover,
];

describe("edition flatplan fixtures (P1-FE-21)", () => {
  it("slot counts match the student edition card", () => {
    const by = (s: EditionSlot["state"]) =>
      allSlots.filter((x) => x.state === s).length;
    expect(by("SOLD")).toBe(studentEdition.slotsSold);
    expect(by("RESERVED")).toBe(studentEdition.slotsReserved);
    expect(allSlots.length).toBe(studentEdition.slotsTotal);
  });

  it("committed equals the sum of sold values", () => {
    const sum = allSlots.reduce((s, x) => s + (x.soldCents ?? 0), 0);
    expect(sum).toBe(studentEdition.committedCents);
  });

  it("every sold slot names its sponsor and value; no other state carries them", () => {
    for (const s of allSlots) {
      if (s.state === "SOLD") {
        expect(s.sponsor, s.code).toBeTruthy();
        expect(s.soldCents, s.code).toBeGreaterThan(0);
      } else {
        expect(s.soldCents, s.code).toBeUndefined();
        expect(s.sponsor, s.code).toBeUndefined();
      }
      if (s.state === "RESERVED") expect(s.holdFor, s.code).toBeTruthy();
    }
  });

  it("the back cover is a singleton", () => {
    expect(allSlots.filter((s) => s.kind === "BACK_COVER")).toHaveLength(1);
    expect(editionBackCover.state).not.toBe(undefined);
  });

  it("slot codes are unique", () => {
    const codes = allSlots.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("Jordan's attribution ledger rows appear on the map, matching exactly", () => {
    for (const sale of studentSales) {
      const slot = allSlots.find((s) => s.code === sale.slotCode);
      expect(slot, sale.slotCode).toBeTruthy();
      expect(slot!.state).toBe("SOLD");
      expect(slot!.soldCents).toBe(sale.valueCents);
      expect(slot!.sponsor).toBe(sale.business);
    }
  });

  it("in-flight prospects hold their reserved positions by name", () => {
    const holds = allSlots
      .filter((s) => s.state === "RESERVED")
      .map((s) => s.holdFor ?? "");
    for (const p of studentProspects.filter(
      (x) => x.stage === "MEETING" || x.stage === "SUBMITTED",
    )) {
      expect(
        holds.some((h) => h.includes(p.business)),
        `${p.business} should hold a reserved slot`,
      ).toBe(true);
    }
  });

  it("every kind has a rack price", () => {
    for (const s of allSlots) {
      expect(SLOT_RACK_CENTS[s.kind], s.code).toBeGreaterThan(0);
    }
  });
});

describe("rights ledger (P1-FE-29, spec §5.3)", () => {
  it("every right carries exactly one piece of evidence", () => {
    for (const r of contentRights) {
      const evidence = [r.acceptanceId, r.licenseRef].filter(Boolean).length;
      expect(evidence, `${r.id} (${r.asset})`).toBe(1);
    }
  });

  it("BTG's own content is never commercially reusable by default (V3 §6)", () => {
    for (const r of contentRights.filter((x) => x.grantorKind === "BTG")) {
      expect(r.mayReuseCommercially, r.id).toBe(false);
    }
  });

  it("every clearance-queue row names what is missing and who grants it", () => {
    expect(clearanceQueue.length).toBeGreaterThan(0);
    for (const q of clearanceQueue) {
      expect(q.missing, q.id).toBeTruthy();
      expect(q.grantor, q.id).toBeTruthy();
    }
  });
});

describe("edition reader (P1-FE-27, principle 10)", () => {
  it("every article opens on an editorial page of the flatplan", () => {
    for (const a of editionReaderArticles) {
      const page = editionPages.find((p) => p.page === a.page);
      expect(page, `article "${a.headline}" → page ${a.page}`).toBeTruthy();
      expect(page!.editorial, `page ${a.page} must be editorial`).toBe(true);
    }
  });

  it("no byline belongs to a student who is not yet approved", () => {
    const notApproved = new Set(
      studentApplications
        .filter((s) => s.state !== "APPROVED")
        .map((s) => s.name),
    );
    for (const a of editionReaderArticles) {
      expect(notApproved.has(a.byline), a.byline).toBe(false);
    }
  });
});

describe("revenue splits (P1-FE-23, spec §5.7)", () => {
  it("shares sum to exactly 10,000 basis points", () => {
    expect(editionSplits.reduce((s, x) => s + x.bps, 0)).toBe(10_000);
  });

  it("derived amounts allocate the committed revenue without remainder", () => {
    const amounts = editionSplits.map((x) =>
      Math.floor((studentEdition.committedCents * x.bps) / 10_000),
    );
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(
      studentEdition.committedCents,
    );
  });

  it("the four payee kinds are the spec's, each exactly once", () => {
    expect(editionSplits.map((x) => x.payeeKind).sort()).toEqual([
      "EDITORIAL_FUND",
      "SCHOOL",
      "SPONSORX",
      "STUDENT_POOL",
    ]);
  });
});
