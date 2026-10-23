import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-FE-04 / P8-FE-07 — the sign-up rules screen carries three switches:
   staff confirm minors (2S1-FE-07), athletes confirm their own rules
   (requireRulesAttestation) and athletes accept the current Content
   Collaboration Agreement (requireCollabAcceptance). Each is drawn with the
   state GET /signup-rules/settings gave it, and the one action PUTs one
   allowlisted flag at a time.

   Same mocking shape as admin-network.test.ts.
   -------------------------------------------------------------------------- */

vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => null }));

const vars = vi.hoisted(() => ({
  actor: null as unknown,
  responses: {} as Record<string, () => Response>,
  calls: [] as { path: string; init?: RequestInit }[],
  revalidated: [] as string[],
}));

vi.mock("@/server/api", () => ({
  fetchActor: async () => vars.actor,
  apiFetch: async (path: string, init?: RequestInit) => {
    vars.calls.push({ path, init });
    return (vars.responses[path] ?? (() => new Response(null, { status: 404 })))();
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => vars.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/new-signups/rules",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));

const sw = (html: string, flag: string) => html.match(new RegExp(`<button[^>]*role="switch"[^>]*data-flag="${flag}"[^>]*>`))?.[0] ?? "";

describe("the sign-up rules screen's three switches", async () => {
  const { default: Page } = await import("@/app/(app)/admin/new-signups/rules/page");

  beforeEach(() => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["BTG_ADMIN"] } };
    vars.responses = {
      "/signup-rules/settings": () => Response.json({ staffConfirmMinors: false, requireRulesAttestation: true, requireCollabAcceptance: false }),
      "/signup-rules/age-table": () => Response.json({ rows: [], unknownPlaceAthletes: 0 }),
    };
  });

  it("draws each switch with its own state and words", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(sw(html, "staffConfirmMinors")).toContain('aria-checked="false"');
    expect(sw(html, "requireRulesAttestation")).toContain('aria-checked="true"');
    expect(sw(html, "requireCollabAcceptance")).toContain('aria-checked="false"');
    expect(html).toContain("BTG staff confirm minors before approval");
    expect(html).toContain("Athletes confirm their own rules");
    expect(html).toContain("Athletes accept the current Content Collaboration Agreement");
    expect(html).toContain("Accepting a deal or listing an item waits until a confirmation that counts is on file — for a minor, the guardian&#x27;s.");
    expect(html).toContain("Accepting a deal or listing an item waits until the current agreement is accepted — for a minor, by the guardian.");
    /* The tile sums the two "before a deal" switches. */
    expect(html).toContain("Own rules wait");
    expect(html).toContain("1 of 2 enforced");
  });

  it("an older API without the two flags reads them as off", async () => {
    vars.responses["/signup-rules/settings"] = () => Response.json({ staffConfirmMinors: true });
    const html = renderToStaticMarkup(await Page());
    expect(sw(html, "staffConfirmMinors")).toContain('aria-checked="true"');
    expect(sw(html, "requireRulesAttestation")).toContain('aria-checked="false"');
    expect(sw(html, "requireCollabAcceptance")).toContain('aria-checked="false"');
    expect(html).toContain("Asked, not enforced");
  });
});

describe("setSignupFlagAction", async () => {
  const { setSignupFlagAction, setStaffConfirmAction } = await import("@/app/(app)/admin/new-signups/rules/actions");

  beforeEach(() => {
    vars.calls = [];
    vars.revalidated = [];
    vars.responses = {
      "/signup-rules/settings": () => Response.json({ staffConfirmMinors: false, requireRulesAttestation: true, requireCollabAcceptance: false }),
    };
  });

  it("PUTs exactly one flag and re-reads the screen", async () => {
    const r = await setSignupFlagAction("requireRulesAttestation", true);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/^On — a new deal or listing waits/);
    expect(vars.calls[0].path).toBe("/signup-rules/settings");
    expect(vars.calls[0].init?.method).toBe("PUT");
    expect(vars.calls[0].init?.body).toBe(JSON.stringify({ requireRulesAttestation: true }));
    expect(vars.revalidated).toEqual(["/admin/new-signups/rules"]);
  });

  it("the minors switch still goes through the same action", async () => {
    await setStaffConfirmAction(true);
    expect(vars.calls[0].init?.body).toBe(JSON.stringify({ staffConfirmMinors: true }));
  });

  it("refuses a flag not on the allowlist, and a non-boolean, without calling the API", async () => {
    expect(await setSignupFlagAction("isAdmin" as never, true)).toEqual({ ok: false, message: "Unknown rule." });
    expect(await setSignupFlagAction("requireCollabAcceptance", "yes" as never)).toEqual({ ok: false, message: "On or off?" });
    expect(vars.calls).toEqual([]);
  });
});
