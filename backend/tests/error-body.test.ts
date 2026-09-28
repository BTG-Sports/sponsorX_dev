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

  /* QA-03 (pass 5): a 5xx used to echo `err.message`, and a Prisma error's
     message carries server file paths and source lines — on PUBLIC routes.
     The body is now generic plus a reference the logs carry too. */
  it("never returns an internal error's message, and hands back a reference", () => {
    const leaky = new Error(
      "Invalid `prisma.athlete.create()` invocation in D:\\srv\\backend\\src\\domain\\application-intake.ts:98:5",
    );
    const { status, body, reference } = errorBody(leaky);
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toMatch(/prisma|\.ts|invocation|D:\\/i);
    expect(body.error.message).toMatch(/something went wrong/i);
    expect(typeof body.error.reference).toBe("string");
    expect(body.error.reference).toBe(reference);
  });

  it("a 5xx carrying its own status is still sanitised", () => {
    const { body } = errorBody(Object.assign(new Error("db at /var/run/pg.sock"), { status: 503 }));
    expect(body.error.message).not.toMatch(/pg\.sock/);
  });

  it("keeps a 4xx's message, and carries its code and details when given", () => {
    class Refused extends Error {
      readonly status = 422;
      readonly code = "profile_incomplete";
      readonly details = { missing: ["stateCode"] };
    }
    const { status, body, reference } = errorBody(new Refused("Missing fields."));
    expect(status).toBe(422);
    expect(reference).toBeNull();
    expect(body.error).toEqual({
      code: "profile_incomplete",
      message: "Missing fields.",
      missing: ["stateCode"],
    });
  });

  /* QA-08 (pass 5): a 429 must tell the client when to come back. */
  it("sets Retry-After from a rate-limited error", () => {
    const err = Object.assign(new Error("Too many requests."), { status: 429, retryAfter: 42 });
    const { status, headers } = errorBody(err);
    expect(status).toBe(429);
    expect(headers["Retry-After"]).toBe("42");
    expect(errorBody(new Error("x")).headers).toEqual({});
  });

  /* A busy 503 (RewardServiceBusyError) is sanitised like every 5xx, but its
     Retry-After still reaches the client — a number carries no detail. */
  it("keeps Retry-After on a sanitised 503", () => {
    const err = Object.assign(new Error("lock timeout at D:\\x\\reward.ts:348"), { status: 503, retryAfter: 2 });
    const { status, headers, body } = errorBody(err);
    expect(status).toBe(503);
    expect(headers["Retry-After"]).toBe("2");
    expect(JSON.stringify(body)).not.toContain("reward.ts");
  });

  /* The QA-03 trigger: 2^31 followers reached an int4 column as a 500. */
  it("refuses an int4 overflow at the contract, as a 400 naming the field", () => {
    const base = {
      legalName: "Maya Okonkwo", displayName: "Maya", email: "maya@example.com",
      stateCode: "MD", sport: "Basketball", ageBand: "18_PLUS",
    };
    const over = AthleteApplicationInput.safeParse({
      ...base, socials: [{ platform: "INSTAGRAM", handle: "maya", followers: 2147483648 }],
    });
    expect(over.success).toBe(false);
    expect(errorBody(over.error as ZodError).body.error.issues).toEqual([
      expect.objectContaining({ path: "socials.0.followers" }),
    ]);
    expect(AthleteApplicationInput.safeParse({
      ...base, socials: [{ platform: "INSTAGRAM", handle: "maya", followers: 2147483647 }],
    }).success).toBe(true);
  });

  it("refuses a year-0 birthDate at the contract (Postgres would 500)", () => {
    const parsed = AthleteApplicationInput.safeParse({
      legalName: "Maya Okonkwo", displayName: "Maya", email: "maya@example.com",
      stateCode: "MD", sport: "Basketball", birthDate: "0000-01-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("intake does not accept a VERIFIED_* source from the applicant", () => {
    const parsed = AthleteApplicationInput.safeParse({
      legalName: "Maya Okonkwo", displayName: "Maya", email: "maya@example.com",
      stateCode: "MD", sport: "Basketball", ageBand: "18_PLUS",
      socials: [{ platform: "INSTAGRAM", handle: "maya", source: "VERIFIED_API" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps status-carrying errors and defaults the rest to 500", () => {
    expect(errorBody(Object.assign(new Error("nope"), { status: 403 })).status).toBe(403);
    expect(errorBody(new Error("boom")).status).toBe(500);
    expect(errorBody(new Error("boom")).body.error.code).toBe("internal_error");
  });
});
