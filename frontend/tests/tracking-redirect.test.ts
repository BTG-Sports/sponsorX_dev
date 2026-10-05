import { afterEach, describe, expect, it, vi } from "vitest";
/* src/server/{api,edge,payouts}.ts import "server-only" (2S8-SEC-05), which
   throws anywhere but a React Server bundle — as it should. Next resolves it
   to nothing on the server; so does this test. */
vi.mock("server-only", () => ({}));

/* `after()` needs a live Next request scope; the redirect is what is under
   test here, so the deferred click write is simply dropped. */
vi.mock("next/server", () => ({ after: () => {} }));

const { GET } = await import("@/app/t/[code]/route");

/* Behind Railway's proxy the handler sees the container's own address, not
   the host the fan typed — this is the URL `req.url` actually carries there. */
const PROXIED = "https://localhost:8080/t/";

function call(code: string) {
  return GET(new Request(PROXIED + code), {
    params: Promise.resolve({ code }),
  });
}

function stubApi(response: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /t/[code] fallback", () => {
  it("sends an unknown code to the site root, not the container's address", async () => {
    stubApi(new Response("not found", { status: 404 }));
    const res = await call("no-such-code");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  it("sends the fan to the site root when the API is unreachable", async () => {
    stubApi(new TypeError("fetch failed"));
    const res = await call("any");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  it("still redirects a known code to its destination", async () => {
    stubApi(Response.json({ destinationUrl: "https://brand.example/offer" }));
    const res = await call("known");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://brand.example/offer");
  });
});
