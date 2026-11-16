import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { viewerIsAthlete } from "@/lib/athlete-order-pause";

/* POL-FE-55 (app review B4) — a guardian acting for a minor landed on a
   SAMPLE invitations inbox (and sample profile pages): the pages tested
   roles.includes("ATHLETE"), but GET /me strips ATHLETE from a guardian
   acting for a minor, and the API refuses the minor's own accept
   (guardian_must_act). Done when: a guardian acting for a minor sees and
   answers the minor's real invitations and opens the real profile, never a
   sample. */

describe("who counts as the athlete on the athlete pages", () => {
  it("the athlete, and a guardian acting for their minor; not a guardian with no ward chosen, not staff", () => {
    expect(viewerIsAthlete({ roles: ["ATHLETE"] })).toBe(true);
    expect(viewerIsAthlete({ roles: ["GUARDIAN"], actingFor: "ath_minor" })).toBe(true);
    expect(viewerIsAthlete({ roles: ["GUARDIAN"], actingFor: null })).toBe(false);
    expect(viewerIsAthlete({ roles: ["BTG_ADMIN"] })).toBe(false);
  });

  it("Invitations, Profile and Profile edit read live for a guardian acting for a minor", () => {
    for (const f of ["athlete/invitations/page.tsx", "athlete/profile/page.tsx", "athlete/profile/edit/page.tsx"]) {
      const src = readFileSync(new URL(`../src/app/(app)/${f}`, import.meta.url), "utf8");
      expect(src, f).toMatch(/viewerIsAthlete\(who\.actor\)/);
      expect(src, f).not.toMatch(/who\.actor\.roles\.includes\("ATHLETE"\)/);
    }
  });
});
