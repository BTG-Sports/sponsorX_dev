import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { displayNameProblem, guardianStatusWords } from "../src/lib/students-live";

/* --------------------------------------------------------------------------
   POL-FE-101 — the NEXT student's own profile (found in staging practice,
   2026-11-17). Reads GET /students/me; the display name is the one field the
   student changes (PATCH /students/me, POL-BE-101); every other row says to
   ask the faculty advisor; a minor's guardian is a status only.
   -------------------------------------------------------------------------- */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = src("../src/app/(app)/next/profile/page.tsx");
const action = src("../src/app/(app)/next/actions.ts");

describe("POL-FE-101 · the display name rule, before sending", () => {
  it("accepts ordinary names, trimmed and with inner spaces collapsed", () => {
    for (const n of ["Riley", "  Riley   J. ", "Zoë Ångström", "Sam 📸", "R2"]) expect(displayNameProblem(n), n).toBeNull();
    expect(displayNameProblem("x".repeat(60))).toBeNull();
  });
  it("names what's wrong: empty, too short, too long, no letter or number, hidden characters", () => {
    expect(displayNameProblem("   ")).toMatch(/Type the name/);
    expect(displayNameProblem("R")).toMatch(/at least 2/);
    expect(displayNameProblem("x".repeat(61))).toMatch(/60 characters/);
    expect(displayNameProblem("!!!")).toMatch(/letter or number/);
    expect(displayNameProblem("Ri​ley")).toMatch(/hidden character/);
    expect(displayNameProblem("Riley\nSmith")).toMatch(/hidden character/);
  });
});

describe("POL-FE-101 · a minor's guardian, as a status only", () => {
  it("none for an adult; linked / waiting / confirmed for a minor", () => {
    expect(guardianStatusWords(null)).toBeNull();
    expect(guardianStatusWords({ linked: false, verified: false })).toMatchObject({ tone: "warn", label: "No parent or guardian linked yet" });
    expect(guardianStatusWords({ linked: true, verified: false })?.label).toMatch(/waiting for SponsorX to confirm/);
    expect(guardianStatusWords({ linked: true, verified: true })).toMatchObject({ tone: "success" });
  });
});

describe("POL-FE-101 · the page and the write", () => {
  it("is in the student portal's menu", () => {
    expect(src("../src/app/(app)/next/layout.tsx")).toContain('{ href: "/next/profile", label: "Profile", icon: "user" }');
  });

  it("reads /students/me and shows every field the task names", () => {
    expect(src("../src/app/(app)/next/live.ts")).toContain('part<ApiStudentProfile>("/students/me")');
    for (const label of ["Legal name", "Graduation year", "School", "Roles", "Account", "Sales code", "Parent or guardian", "Display name"]) {
      expect(page, label).toContain(label);
    }
  });

  it("every read-only row says to ask the faculty advisor, and the advisor's email is a mailto", () => {
    expect(page).toContain('const ASK = "Wrong? Ask your faculty advisor to correct it."');
    expect(page).toContain("hint = ASK");
    expect(page).toContain("mailto:${a.email}");
  });

  it("the write sends the display name alone to /students/me, never an id from the form", () => {
    const fn = action.slice(action.indexOf("export async function updateDisplayNameAction"));
    expect(fn).toContain('apiFetch("/students/me", { method: "PATCH", body: JSON.stringify({ displayName }) })');
    expect(fn).not.toMatch(/studentId\)?\s*}`|students\/\$\{/);
  });

  it("never shows a date of birth, an email of the student's or the guardian's name", () => {
    expect(page).not.toMatch(/birthDate|ageBand|legalName: string; email/);
    expect(page).not.toMatch(/guardian\.(legalName|email|phone)/);
  });
});
