import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { errorBody } from "../src/lib/error-body";
import { AthleteApplicationInput } from "../src/contracts/athlete";

/* --------------------------------------------------------------------------
   P3-FE-01 surfaced this: a ZodError carries no `status`, so validation
   failures on the public intake answered 500 "internal_error" — telling the
   caller we broke when they did. The mapping is pure and tested here; the
   middleware only applies it.
   -------------------------------------------------------------------------- */

describe("errorBody", () => {
  it("maps a ZodError to 400 with named issues", () => {
    const parsed = AthleteApplicationInput.safeParse({
      legalName: "Maya Okonkwo",
      displayName: "Maya Okonkwo",
      email: "not-an-email",
      stateCode: "Maryland",
      sport: "Basketball",
      // neither birthDate nor ageBand — trips the refinement too
    });
    expect(parsed.success).toBe(false);
    const { status, body } = errorBody(parsed.error as ZodError);
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation");
    const issues = body.error.issues as Array<{ path: string; message: string }>;
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("email");
    expect(paths).toContain("stateCode");
    expect(paths).toContain("birthDate"); // the one-of refinement's home
    for (const i of issues) expect(i.message).toBeTruthy();
  });

  it("keeps status-carrying errors and defaults the rest to 500", () => {
    expect(errorBody(Object.assign(new Error("nope"), { status: 403 })).status).toBe(403);
    expect(errorBody(new Error("boom")).status).toBe(500);
    expect(errorBody(new Error("boom")).body.error.code).toBe("internal_error");
  });
});
