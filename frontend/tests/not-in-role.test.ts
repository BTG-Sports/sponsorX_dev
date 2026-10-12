import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/* The module also exports staffWithoutAccess, which reaches @/server/api
   (a "server-only" import) and @/server/viewer (which reaches Clerk) — mock
   both so importing NotInRole doesn't need a request context, same as the
   other component tests do for their server-backed modules. */
vi.mock("@/server/api", () => ({ fetchActor: async () => ({ status: "anon" }) }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => null }));

import { NotInRole } from "../src/components/not-in-role";

/* P1-ART-25 review — a Finance-only viewer bounced off a desk they can't use
   used to always read "Back to the Operations Board" → /admin, a board they
   have no access to. The label and href now follow the viewer: Finance-only
   goes to the Treasury, everyone else keeps the Operations Board. */
describe("P1-ART-25 · NotInRole sends the viewer home by their own root", () => {
  it("sends a Finance-only viewer to the Treasury, by name", () => {
    const html = renderToStaticMarkup(createElement(NotInRole, { path: "/admin/commission", title: "Commission", roles: ["FINANCE"] }));
    expect(html).toContain("Back to the Treasury");
    expect(html).toMatch(/href="\/admin\/finance"/);
    expect(html).not.toContain("Back to the Operations Board");
  });

  it("keeps the Operations Board for a BTG admin, and for Finance held alongside another staff role", () => {
    for (const roles of [["BTG_ADMIN"], ["FINANCE", "SALES"]]) {
      const html = renderToStaticMarkup(createElement(NotInRole, { path: "/admin/commission", title: "Commission", roles }));
      expect(html, roles.join("+")).toContain("Back to the Operations Board");
      expect(html, roles.join("+")).toMatch(/href="\/admin"/);
    }
  });
});
