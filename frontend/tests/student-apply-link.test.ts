import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-FE-48 — the student home leads to the public student application.
   Found in walkthrough practice (2026-11-15): nothing in the student portal
   linked to /next/apply, so the presenter typed the address. The card lives
   in live-views.tsx and both the live home and the fixture preview use it.
   -------------------------------------------------------------------------- */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const views = src("../src/app/(app)/next/live-views.tsx");
const home = src("../src/app/(app)/next/page.tsx");

describe("POL-FE-48 · the way to the student application", () => {
  it("the card links to /next/apply with the agreed label", () => {
    const card = views.slice(views.indexOf("export function StudentApplyCard"), views.indexOf("export function LiveStudentHome"));
    expect(card).toContain('href="/next/apply"');
    expect(card).toContain("Open the student application");
    expect(card).toContain("Know someone who should join?");
  });

  it("the live home and the fixture preview both show it, the unlinked state does not", () => {
    const live = views.slice(views.indexOf("export function LiveStudentHome"));
    expect(live.slice(0, live.indexOf("\n}\n"))).toContain("<StudentApplyCard />");
    expect(home).toContain("<StudentApplyCard />");
    const unlinked = views.slice(views.indexOf("export function StudentUnlinked"), views.indexOf("function ActiveOnly"));
    expect(unlinked).not.toContain("StudentApplyCard");
  });

  it("the public footer links to the application too", () => {
    expect(src("../src/components/site-chrome.tsx")).toContain('href: "/next/apply"');
  });
});
