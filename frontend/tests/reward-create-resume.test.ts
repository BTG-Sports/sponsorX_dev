import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The reward creator's retry — QA pass 5 ("suspected: a part-way create
   failure followed by a retry may duplicate the reward").

   createRewardAction is three steps: the reward, a token per athlete, and
   optionally the move to ACTIVE. A failure after the first step leaves a
   reward behind and returns its id; the retry sends that id back and must
   FINISH that reward — only the missing tokens, go live if asked — never
   POST a second one.
   -------------------------------------------------------------------------- */

type Call = { path: string; method: string; body: unknown };
const vars = {
  calls: [] as Call[],
  failTokenFor: null as string | null,
  saved: { state: "DRAFT", tokens: [] as { id: string; athlete: { id: string; displayName: string } | null; qrReady: boolean }[] },
};

vi.mock("@/server/api", () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    vars.calls.push({ path, method, body });
    if (method === "POST" && path.endsWith("/rewards")) return Response.json({ id: "rw_1", state: "DRAFT" }, { status: 201 });
    if (method === "POST" && path.endsWith("/tokens")) {
      if (body?.athleteId === vars.failTokenFor) return Response.json({ error: { message: "boom" } }, { status: 500 });
      vars.saved.tokens.push({ id: `tk_${body.athleteId}`, athlete: { id: body.athleteId, displayName: body.athleteId }, qrReady: false });
      return Response.json({ id: `tk_${body.athleteId}` }, { status: 201 });
    }
    if (method === "POST" && path.endsWith("/transition")) {
      vars.saved.state = "ACTIVE";
      return Response.json({ id: "rw_1", state: "ACTIVE" });
    }
    if (method === "GET" && path === "/rewards/rw_1") return Response.json({ id: "rw_1", ...vars.saved, consent: { version: "v", text: "t" } });
    return Response.json({}, { status: 404 });
  },
}));

const { createRewardAction } = await import("@/app/(app)/admin/rewards/actions");

const input = {
  campaignId: "cmp_1", offerText: "Free taco", terms: "One per fan", expiresAt: "2099-01-01T00:00:00.000Z",
  singleUse: true, eligibility: "ANYONE" as const, eligibilityNote: null, redemptionCap: 50,
  landingHeadline: null, landingSubhead: null, reserveMinutes: 15, athleteIds: ["a1", "a2", "a3"], activate: true,
};

beforeEach(() => {
  vars.calls = [];
  vars.failTokenFor = null;
  vars.saved = { state: "DRAFT", tokens: [] };
});

describe("createRewardAction · retry after a part-way failure", () => {
  it("sends the hold window with the reward", async () => {
    await createRewardAction(input);
    const post = vars.calls.find((c) => c.method === "POST" && c.path.endsWith("/rewards"));
    expect(post?.body).toMatchObject({ redemptionCap: 50, reserveMinutes: 15 });
  });

  it("a token failure returns the saved reward's id; the retry finishes it without a second reward", async () => {
    vars.failTokenFor = "a2";
    const first = await createRewardAction(input);
    expect(first).toMatchObject({ ok: false, rewardId: "rw_1" });

    vars.failTokenFor = null;
    vars.calls = [];
    const retry = await createRewardAction({ ...input, resumeRewardId: "rw_1" });
    expect(retry).toEqual({ ok: true, rewardId: "rw_1", tokens: 3, activated: true });
    /* No second reward, and a1's token is not issued twice. */
    expect(vars.calls.filter((c) => c.method === "POST" && c.path.endsWith("/rewards"))).toHaveLength(0);
    expect(vars.calls.filter((c) => c.path.endsWith("/tokens")).map((c) => (c.body as { athleteId: string }).athleteId)).toEqual(["a2", "a3"]);
    expect(vars.calls.filter((c) => c.path.endsWith("/transition"))).toHaveLength(1);
  });

  it("a retry on a reward that already went live does not try to move it again", async () => {
    vars.saved = { state: "ACTIVE", tokens: ["a1", "a2", "a3"].map((a) => ({ id: `tk_${a}`, athlete: { id: a, displayName: a }, qrReady: true })) };
    const retry = await createRewardAction({ ...input, resumeRewardId: "rw_1" });
    expect(retry).toMatchObject({ ok: true, tokens: 3 });
    expect(vars.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});
