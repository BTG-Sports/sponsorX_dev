import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { dayIso, editionBody, editionFormProblem, maySetUpNext, thresholdCents } from "@/lib/next-setup-live";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/admin/next/actions", () => ({ createPublicationAction: vi.fn(), createEditionAction: vi.fn(), updateEditionAction: vi.fn(), cancelEditionAction: vi.fn() }));

/* POL-FE-56 (app review B5) — BTG couldn't create or change a NEXT
   publication or edition. Done when: BTG creates a publication for a school
   (it then appears on /next/apply), creates an edition, edits its dates, and
   cancels one. (The rules are the API's — backend/tests/pol-be-56-next-setup.test.ts.) */

const ok = { label: "Spring 2027", closeDate: "2027-03-01", publishTarget: "2027-04-01", threshold: "$3,000", salesOpenAt: "" };

describe("the edition form", () => {
  it("checks the name, the dates in order and the threshold in dollars", () => {
    expect(editionFormProblem(ok)).toBeNull();
    expect(editionFormProblem({ ...ok, label: " " })).toMatch(/Name the edition/);
    expect(editionFormProblem({ ...ok, publishTarget: "2027-02-01" })).toBe("Publishing comes after sales close.");
    expect(editionFormProblem({ ...ok, threshold: "lots" })).toMatch(/threshold in dollars/);
    expect(editionFormProblem({ ...ok, salesOpenAt: "2027-03-05" })).toBe("Sales open before they close.");
  });

  it("sends days at noon UTC and the threshold in cents", () => {
    expect(dayIso("2027-03-01")).toBe("2027-03-01T12:00:00.000Z");
    expect(thresholdCents("$3,000")).toBe(300_000);
    expect(editionBody(ok)).toEqual({ label: "Spring 2027", closeDate: "2027-03-01T12:00:00.000Z", publishTarget: "2027-04-01T12:00:00.000Z", thresholdCents: 300_000 });
  });

  it("only BTG admins set NEXT up", () => {
    expect(maySetUpNext(["BTG_ADMIN"])).toBe(true);
    expect(maySetUpNext(["SALES"])).toBe(false);
  });
});

describe("the Set up panel", () => {
  it("offers the school list, the edition form, the edit while selling, and Cancel", async () => {
    const m = await import("@/components/next-setup");
    const pub = renderToStaticMarkup(createElement(m.NewPublicationForm, { schools: [{ id: "s1", name: "Eastside High" }] }));
    expect(pub).toContain(">Eastside High</option>");
    expect(pub).toContain("No school — the regional edition");
    const ed = renderToStaticMarkup(createElement(m.NewEditionForm, { publications: [{ id: "p1", name: "The Eastside Eagle", propertyId: "s1", schoolName: "Eastside High" }] }));
    expect(ed).toContain("The Eastside Eagle · Eastside High");
    expect(renderToStaticMarkup(createElement(m.NewEditionForm, { publications: [] }))).toContain("Create a publication first");
    const cur = { id: "e1", label: "Winter", state: "SELLING", closeDate: "2026-12-01T00:00:00.000Z", publishTarget: "2027-01-10T00:00:00.000Z", thresholdCents: 250_000, salesOpenAt: null };
    expect(renderToStaticMarkup(createElement(m.EditEditionForm, { edition: cur }))).toContain('value="2500"');
    expect(renderToStaticMarkup(createElement(m.EditEditionForm, { edition: { ...cur, state: "IN_PRODUCTION" } }))).toContain("fixed now");
    expect(renderToStaticMarkup(createElement(m.CancelEditionButton, { edition: { ...cur, state: "CLOSED" } }))).toContain("Cancel this edition");
    expect(renderToStaticMarkup(createElement(m.CancelEditionButton, { edition: { ...cur, state: "PUBLISHED_DIGITAL" } }))).toBe("");
  });

  it("is on BTG's Editions page, also when there is no edition yet", () => {
    const src = readFileSync(new URL("../src/app/(app)/admin/next/editions/live-editions.tsx", import.meta.url), "utf8");
    expect(src.match(/<SetupPanel live=\{live\} \/>/g)?.length).toBe(2);
    expect(src).toMatch(/readJson<ApiPublications>\("\/publications"\)/);
  });
});
