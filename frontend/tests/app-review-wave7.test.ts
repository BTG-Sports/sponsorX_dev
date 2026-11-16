import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decisionLine, loginLine } from "@/lib/students-live";
import { publicEditionHref } from "@/lib/editions-live";
import { currentEdition, slotLine, thisEditionView } from "@/lib/this-edition";
import { parseRoster } from "@/lib/roster-paste";

/* App review wave 7 — SponsorX NEXT (POL-FE-76, POL-FE-77). */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-76 · NEXT applicants are told, and the advisor sees the login", () => {
  it("an approved student's card says whether they can sign in", () => {
    expect(loginLine({ login: "invited", email: "rae@school.org" })).toEqual({ text: expect.stringContaining("rae@school.org"), ok: true });
    expect(loginLine({ login: "signed-in", email: null })).toEqual({ text: "Has signed in.", ok: true });
    expect(loginLine({ login: "no-email", email: null })!.ok).toBe(false);
    expect(loginLine({ login: "address-in-use", email: "x@y.org" })!.text).toMatch(/already used by another SponsorX login/);
    expect(loginLine({ login: null, email: "a@b.org" })).toBeNull();
    expect(src("app/(app)/advisor/live-advisor.tsx")).toContain("loginLine(s) &&");
  });

  it("after a decision the advisor is told who was emailed, not just Saved.", () => {
    expect(decisionLine("APPROVED", { login: "invited", email: "rae@school.org", displayName: "Rae" })).toMatch(/^Approved\. Rae has been emailed\. Login ready/);
    expect(decisionLine("CHANGES_REQUESTED", { login: null, email: "ivy@school.org", displayName: "Ivy" })).toBe("Sent back with your note. Ivy has been emailed.");
    expect(decisionLine("REJECTED", { login: null, email: null, displayName: "Ola" })).toBe("Declined. They have no email address, so tell them yourself.");
    expect(decisionLine("UNDER_REVIEW", null)).toBe("Saved.");
    expect(src("app/(app)/advisor/actions.ts")).toContain("decisionLine(after?.state ?? to, after)");
  });
});

describe("POL-FE-77 · NEXT public pages, the QR and the student's edition", () => {
  it("My code draws a real QR of the link, not the decorative pattern", () => {
    expect(src("app/(app)/next/code/page.tsx")).toContain("await qrSvg(`${origin}/s/${live.code}`)");
    expect(src("components/student-code-card.tsx")).toContain("{qr ? <RealQr svg={qr}");
    expect(src("server/qr.ts")).toContain('QRCode.toString(link, { type: "svg"');
  });

  it("the public edition shows approved text and counts a read as a click on the article", () => {
    expect(src("app/(public)/next/[school]/[edition]/live-reader.tsx")).toContain("{c.text && <EditionPiece");
    expect(src("app/(public)/next/[school]/[edition]/actions.ts")).toContain('type: "LINK_CLICK", targetKind: "ARTICLE"');
  });

  it("a published edition links to its public page, and the school list links too", () => {
    const e = { id: "ed1", state: "PUBLISHED_DIGITAL", publication: { propertyId: "p1", property: { slug: "northside" } } };
    expect(publicEditionHref(e)).toBe("/next/northside/ed1");
    expect(publicEditionHref({ ...e, state: "SELLING" })).toBeNull();
    expect(publicEditionHref({ ...e, publication: { propertyId: null, property: null } })).toBe("/next/regional/ed1");
    expect(src("app/(app)/admin/next/editions/live-editions.tsx")).toContain("View the public edition →");
    expect(src("app/(public)/next/schools/page.tsx")).toContain('href={`/next/${encodeURIComponent(e.school?.slug ?? "regional")}');
  });

  it("students and advisors see This edition: the one closing soonest, with open positions while ads sell", () => {
    const eds = [
      { id: "old", state: "DISTRIBUTED", closeDate: "2026-05-01T00:00:00Z" },
      { id: "late", state: "SELLING", closeDate: "2026-12-20T00:00:00Z" },
      { id: "soon", state: "SELLING", closeDate: "2026-12-01T00:00:00Z" },
    ];
    expect(currentEdition(eds)?.id).toBe("soon");
    expect(currentEdition([eds[0]!])?.id).toBe("old");
    expect(currentEdition([])).toBeNull();
    const slots = [
      { id: "a", slotCode: "P03-HALF", kind: "HALF_PAGE", page: 3, priceCents: 25000, sold: false },
      { id: "b", slotCode: "BACK", kind: "BACK_COVER", page: null, priceCents: 100000, sold: true },
    ];
    expect(slotLine(slots[0]!)).toBe("Page 3 · half page — $250");
    const v = thisEditionView({ label: "Fall 2026", state: "SELLING", closeDate: "2026-12-01T00:00:00Z", inventory: { total: 2, sold: 1, committedCents: 0, rackCents: 0 } }, slots);
    expect(v).toEqual({ label: "Fall 2026", state: "Selling ads", closeLine: "Ads close Dec 1", sold: 1, total: 2, open: ["Page 3 · half page — $250"] });
    expect(thisEditionView({ label: "x", state: "IN_PRODUCTION", closeDate: "2026-12-01T00:00:00Z", inventory: { total: 2, sold: 1, committedCents: 0, rackCents: 0 } }, slots).open).toEqual([]);
    expect(src("app/(app)/next/page.tsx")).toContain("edition={await loadThisEdition()}");
    expect(src("app/(app)/advisor/live-advisor.tsx")).toContain("<ThisEditionCard v={edition} />");
  });

  it("the advisor pastes a roster: one student per line, with or without a year", () => {
    const r = parseRoster("Jordan Lee, 2027\nSam Rivera\tl2026\n\nAva Chen\t2026\nJordan Lee, 2027");
    expect(r.rows).toEqual([
      { legalName: "Jordan Lee", gradYear: 2027 },
      { legalName: "Sam Rivera l2026", gradYear: null },
      { legalName: "Ava Chen", gradYear: 2026 },
    ]);
    expect(parseRoster("Old Grad, 1999").problems[0]).toMatch(/isn't a graduation year/);
    expect(src("app/(app)/advisor/actions.ts")).toContain("/roster`");
  });
});
