import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Pagination } from "@/components/pagination";

/* P1-ART-25 review — the Vault's pager reads as a struck gold coin, not a
   tinted one (pagination.tsx's own comment on ACTIVE_TONE.vault). Pinned
   here so a future tone tweak can't silently drop the vault's own treatment. */

describe("Pagination · the vault tone", () => {
  it("gives the active page solid brushed gold, not a tint", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, { page: 2, count: 3, tone: "vault", onChange: () => {} }),
    );
    const active = html.match(/<button[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(active).toBeTruthy();
    expect(active).toContain("bg-[#d4b062]");
    expect(active).toContain("text-[#06100c]");
    expect(active).toContain("border-[#d4b062]");
  });

  it("never gives a non-vault tone the vault's gold", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, { page: 2, count: 3, tone: "admin", onChange: () => {} }),
    );
    const active = html.match(/<button[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(active).toBeTruthy();
    expect(active).not.toContain("bg-[#d4b062]");
  });
});
