import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-12 / 2S4-FE-06 — the sponsor's cancel action tells the API what
   the dialog showed (`expect`), and reads the API's "the terms changed while
   it was open" refusal (409 cancel_terms_changed) as such, with its words.
   -------------------------------------------------------------------------- */

const apiFetch = vi.fn();
vi.mock("@/server/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { cancelLineAction } = await import("@/app/(app)/sponsor/orders/[id]/delivery-actions");

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("cancelLineAction", () => {
  beforeEach(() => apiFetch.mockReset());

  it("sends expect FREE for the free dialog and ASK (with the reason) for asking", async () => {
    apiFetch.mockResolvedValueOnce(reply(200, { outcome: "REFUNDED" }));
    expect(await cancelLineAction("o1", "l1", "", "free")).toEqual({ ok: true, outcome: "REFUNDED" });
    expect(apiFetch.mock.calls[0]![0]).toBe("/deliveries/l1/cancel");
    expect(JSON.parse(apiFetch.mock.calls[0]![1].body)).toEqual({ expect: "FREE" });

    apiFetch.mockResolvedValueOnce(reply(200, { outcome: "ASKED_SELLER" }));
    expect(await cancelLineAction("o1", "l1", "  Venue flooded ", "ask")).toEqual({ ok: true, outcome: "ASKED_SELLER" });
    expect(JSON.parse(apiFetch.mock.calls[1]![1].body)).toEqual({ reason: "Venue flooded", expect: "ASK" });
  });

  it("the free cut-off passed while the dialog was open: termsChanged, with the API's message", async () => {
    const message = "The free cancellation deadline (2026-10-14 00:00 UTC) has passed while this was open, so Jo Park now has to agree. Nothing was cancelled — add a reason and ask them.";
    apiFetch.mockResolvedValueOnce(reply(409, { error: { code: "cancel_terms_changed", message } }));
    expect(await cancelLineAction("o1", "l1", "", "free")).toEqual({ ok: false, termsChanged: true, message });
  });

  it("any other refusal is shown as the API says it, without termsChanged", async () => {
    apiFetch.mockResolvedValueOnce(reply(409, { error: { code: "bad_request", message: "This line has already been refunded." } }));
    expect(await cancelLineAction("o1", "l1", "", "free")).toEqual({ ok: false, message: "This line has already been refunded." });
    expect(await cancelLineAction("o1", "l1", "", "ask")).toMatchObject({ ok: false, message: expect.stringMatching(/Say why/) });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
