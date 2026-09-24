import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/u/[token]/route";

/* P6-SEC-03 — one tap, no login. GET must never withdraw: mail scanners and
   link previewers fetch every URL in a message. */

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("https://localhost:8080/u/ev.sig", { method });

afterEach(() => vi.unstubAllGlobals());

describe("/u/[token]", () => {
  it("GET shows one button and does not call the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await GET(req("GET"), ctx("ev.sig"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<form method="post" action="/u/ev.sig">');
    expect(html).toContain("Unsubscribe</button>");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST withdraws through the API and confirms", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ withdrawn: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req("POST"), ctx("ev.sig"));
    expect(await res.text()).toContain("You are unsubscribed");
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain("/api/v1/public/unsubscribe/ev.sig");
  });

  it("POST says so plainly when the token is not valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ withdrawn: false })));
    const res = await POST(req("POST"), ctx("junk"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("That link did not work");
  });

  it("escapes the token into the form action", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const html = await (await GET(req("GET"), ctx('"><script>'))).text();
    expect(html).not.toContain("<script>");
  });
});
