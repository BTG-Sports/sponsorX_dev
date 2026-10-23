import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-FE-04 / P8-FE-07 — /athlete/confirmations, rendered against a stubbed
   API for each seat: an adult with both current, an adult with the rules
   outstanding, a minor's own login (the guardian confirms), and a guardian
   acting for the minor. Then the two server actions: the body and the
   signer headers they send, and how each refusal comes back as a value.
   -------------------------------------------------------------------------- */

/* src/server/edge.ts imports "server-only"; Next resolves it to nothing on
   the server, and so does this test. */
vi.mock("server-only", () => ({}));

const vars = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  calls: [] as { path: string; init?: RequestInit }[],
  responses: {} as Record<string, () => Response>,
  revalidated: [] as string[],
}));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    vars.calls.push({ path, init });
    const key = `${init?.method ?? "GET"} ${path}`;
    return (vars.responses[key] ?? (() => new Response(null, { status: 404 })))();
  },
}));
vi.mock("@/server/portal", () => ({ requirePortalAccess: async () => vars.actor }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/athlete/confirmations",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7", "user-agent": "phone" }) }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => vars.revalidated.push(p) }));

import { COLLAB_WORDS, RULES_WORDS, type ApiMyCollab, type ApiMyRules } from "../src/lib/confirmations-live";
import { cardMode, refusalResult, viewerOf } from "../src/lib/athlete-confirmations";

const ADULT = { userId: "u1", tenantId: "t1", roles: ["ATHLETE"], wards: [], actingFor: null, guardianControl: null };
const MINOR = { ...ADULT, guardianControl: { guardianName: "Maria Lopez", comingOfAge: false, dueAt: null } };
const GUARDIAN = {
  userId: "g1", tenantId: "t1", roles: ["GUARDIAN"], actingFor: "a1",
  wards: [{ athleteId: "a1", displayName: "Ana Lopez", firstName: "Ana", comingOfAge: false }], guardianControl: null,
};

const rules = (over: Partial<ApiMyRules> = {}): ApiMyRules => ({
  version: "2026-09", text: "Follow your school, league and local rules.\nNo exceptions.",
  attestedAt: "2026-10-03T12:00:00.000Z", attestedVersion: "2026-09", attestedVia: "PORTAL",
  current: true, required: false, byGuardian: false, ...over,
});
const collab = (over: Partial<ApiMyCollab> = {}): ApiMyCollab => ({
  agreementId: "agr_1", version: 3, bodyHash: "sha256:abc", body: "COLLAB BODY — verbatim text.",
  acceptedAt: "2026-10-04T12:00:00.000Z", current: true, required: false, byGuardian: false, ...over,
});
const json = (b: unknown, status = 200) => () => Response.json(b, { status });

describe("the confirmations page", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("../src/app/(app)/athlete/confirmations/page");
  const render = async (sp: Record<string, string> = {}) =>
    renderToStaticMarkup(createElement("div", null, await Page({ searchParams: Promise.resolve(sp) })));

  beforeEach(() => {
    vars.actor = ADULT;
    vars.calls = [];
    vars.responses = { "GET /me/rules-attestation": json(rules()), "GET /me/collab-agreement": json(collab()) };
  });

  it("both current: two quiet lines, no tick box, and the way back", async () => {
    const html = await render({ return: "/athlete/orders/o1" });
    expect(html).toContain("Confirmed on Oct 3, 2026 · rules wording 2026-09");
    expect(html).toContain("Confirmed on Oct 4, 2026 · agreement version 3");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('href="/athlete/orders/o1"');
    expect(html).toContain("Back to where you were");
    /* The cards in order: own rules first. */
    expect(html.indexOf(RULES_WORDS.title)).toBeLessThan(html.indexOf(COLLAB_WORDS.title));
  });

  it("rules outstanding: the wording verbatim, the tick line, Confirm and the record note", async () => {
    vars.responses["GET /me/rules-attestation"] = json(rules({ current: false, attestedAt: null, attestedVersion: null, required: true }));
    const html = await render();
    expect(html).toContain("Follow your school, league and local rules.\nNo exceptions.");
    expect(html).toContain(RULES_WORDS.checkbox("2026-09"));
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("A new deal waits until you confirm this.");
    expect(html).toContain(RULES_WORDS.recordNote);
    /* The agreement card stays quiet. */
    expect(html).toContain("Confirmed on Oct 4, 2026");
    expect(html).not.toContain(COLLAB_WORDS.checkbox(3));
  });

  it("collab outstanding: the body verbatim and the accept line", async () => {
    vars.responses["GET /me/collab-agreement"] = json(collab({ current: false, acceptedAt: null }));
    const html = await render();
    expect(html).toContain("COLLAB BODY — verbatim text.");
    expect(html).toContain(COLLAB_WORDS.checkbox(3));
    expect(html).toContain(">Accept<");
  });

  it("a minor's own login: the guardian confirms, no tick box or button", async () => {
    vars.actor = MINOR;
    vars.responses["GET /me/rules-attestation"] = json(rules({ current: false, byGuardian: true, required: true }));
    vars.responses["GET /me/collab-agreement"] = json(collab({ current: false, byGuardian: true }));
    const html = await render();
    expect(html).toContain("Maria Lopez confirms this from their own login — a new deal waits until they do.");
    expect(html).toContain("Maria Lopez confirms this from their own login.");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain(RULES_WORDS.checkbox("2026-09"));
  });

  it("a guardian acting for the minor: the guardian's line, in the ward's name", async () => {
    vars.actor = GUARDIAN;
    vars.responses["GET /me/rules-attestation"] = json(rules({ current: false, byGuardian: true }));
    const html = await render();
    expect(html).toContain(RULES_WORDS.guardianCheckbox("Ana Lopez", "2026-09"));
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("What Ana Lopez needs confirmed before a new deal.");
  });

  it("a guardian with no ward picked: both reads refused, a plain note, nothing thrown", async () => {
    vars.actor = { ...GUARDIAN, actingFor: null };
    vars.responses = {
      "GET /me/rules-attestation": json({ error: { code: "forbidden", message: "forbidden" } }, 403),
      "GET /me/collab-agreement": json({ error: { code: "forbidden", message: "forbidden" } }, 403),
    };
    const html = await render();
    expect(html).toContain("Pick the athlete from your");
    expect(html).toContain("can’t be loaded right now");
  });
});

describe("the confirmation actions", async () => {
  const { confirmRulesAction, acceptCollabAction } = await import("../src/app/(app)/athlete/confirmations/actions");

  beforeEach(() => {
    process.env.SPONSORX_EDGE_KEY = "edge-test-key";
    vars.calls = [];
    vars.revalidated = [];
    vars.responses = {};
  });

  it("confirms the rules with the version, the signer's address and browser, then re-reads", async () => {
    vars.responses["POST /me/rules-attestation"] = json(rules());
    expect(await confirmRulesAction("2026-09")).toEqual({ ok: true });
    const [call] = vars.calls;
    expect(call.path).toBe("/me/rules-attestation");
    expect(call.init?.body).toBe(JSON.stringify({ version: "2026-09" }));
    const sent = call.init?.headers as Record<string, string>;
    expect(sent["x-sponsorx-client-ip"]).toBe("203.0.113.7");
    expect(sent["x-sponsorx-client-ua"]).toBe("phone");
    expect(sent["x-sponsorx-edge-key"]).toBe("edge-test-key");
    expect(vars.revalidated).toEqual(["/athlete", "/athlete/confirmations"]);
  });

  it("a stale wording asks for a reload with the house sentence", async () => {
    vars.responses["POST /me/rules-attestation"] = json({ error: { code: "rules_attestation_stale", message: "stale" } }, 422);
    expect(await confirmRulesAction("2026-08")).toEqual({ ok: false, message: RULES_WORDS.stale, reload: true });
  });

  it("a minor's own login gets the API's own sentence", async () => {
    vars.responses["POST /me/rules-attestation"] = json({ error: { code: "guardian_must_act", message: "Your guardian confirms this." } }, 403);
    expect(await confirmRulesAction("2026-09")).toEqual({ ok: false, message: "Your guardian confirms this." });
  });

  it("accepts the agreement by id and hash; a changed text reloads, an already-accepted one counts as done", async () => {
    vars.responses["POST /agreements/accept"] = json({ acceptanceId: "acc_1", acceptedAt: "2026-10-23T00:00:00.000Z", guardianId: null }, 201);
    expect(await acceptCollabAction("agr_1", "sha256:abc")).toEqual({ ok: true });
    expect(vars.calls[0].init?.body).toBe(JSON.stringify({ agreementId: "agr_1", bodyHashShown: "sha256:abc" }));

    vars.responses["POST /agreements/accept"] = json({ error: { code: "bad_request", message: "The agreement text has changed since it was shown." } }, 409);
    expect(await acceptCollabAction("agr_1", "sha256:old")).toEqual({ ok: false, message: COLLAB_WORDS.changed, reload: true });

    vars.responses["POST /agreements/accept"] = json({ error: { code: "bad_request", message: "This agreement was already accepted." } }, 409);
    const r = await acceptCollabAction("agr_1", "sha256:abc");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/already confirmed/i);
  });

  it("refuses bad arguments without calling the API", async () => {
    expect(await confirmRulesAction("")).toEqual({ ok: false, message: "Nothing to confirm." });
    expect(await acceptCollabAction("not an id!", "sha256:abc")).toEqual({ ok: false, message: "Nothing to accept." });
    expect(vars.calls).toEqual([]);
  });
});

describe("the pure helpers", () => {
  it("names the ward for a guardian acting, the guardian for a minor's own login", () => {
    expect(viewerOf(GUARDIAN)).toEqual({ actingForWard: true, wardName: "Ana Lopez", guardianName: "Your guardian" });
    expect(viewerOf(MINOR)).toEqual({ actingForWard: false, wardName: "the athlete", guardianName: "Maria Lopez" });
    expect(viewerOf({ guardianControl: { guardianName: null } }).guardianName).toBe("Your guardian");
  });

  it("decides each card's mode by standing and seat", () => {
    const adult = { actingForWard: false };
    expect(cardMode(null, adult)).toBe("unavailable");
    expect(cardMode({ current: true, byGuardian: false }, adult)).toBe("confirmed");
    expect(cardMode({ current: false, byGuardian: false }, adult)).toBe("ask");
    expect(cardMode({ current: false, byGuardian: true }, adult)).toBe("guardianDoes");
    expect(cardMode({ current: false, byGuardian: true }, { actingForWard: true })).toBe("ask");
  });

  it("falls back to the API's message, then a plain one", () => {
    expect(refusalResult("rules", 500, { error: { code: "internal", message: "Something broke." } }, "fallback")).toEqual({ ok: false, message: "Something broke." });
    expect(refusalResult("rules", 500, null, "fallback")).toEqual({ ok: false, message: "fallback" });
    /* The other card's stale code is not this card's reload. */
    expect(refusalResult("rules", 422, { error: { code: "not_collab_agreement" } }, "fallback")).toEqual({ ok: false, message: "fallback" });
  });
});
