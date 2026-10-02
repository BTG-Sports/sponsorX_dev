import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUDGET_MB } from "../scripts/city-kit/lib.mjs";

/* --------------------------------------------------------------------------
   P1-ART-09 — "desktop kit ≤ 14 MB, lite kit ≤ 6 MB".

   The kit pipeline (scripts/city-kit) checks the budget when it builds, but
   it only retries at smaller textures and then prints "OVER" and exits 0 —
   so an over-budget kit could be committed and nothing would fail. This is
   the gate on the files that actually ship. Same budget object as the
   pipeline, so the two cannot disagree.
   -------------------------------------------------------------------------- */

const MB = 1_000_000; // the pipeline's budget is decimal megabytes
const kit = (name: string) => fileURLToPath(new URL(`../public/models/city/${name}`, import.meta.url));

describe("the committed city kits stay inside their size budget", () => {
  it.each([
    ["city-kit.glb", "desktop" as const],
    ["city-kit-lite.glb", "lite" as const],
  ])("%s ≤ its %s budget", (file, tier) => {
    const bytes = statSync(kit(file)).size;
    expect(bytes, `${file}: ${(bytes / MB).toFixed(2)} MB`).toBeLessThanOrEqual(BUDGET_MB[tier] * MB);
    expect(bytes).toBeGreaterThan(0);
  });

  it("the lite kit is the smaller one — it is what low-end phones download", () => {
    expect(statSync(kit("city-kit-lite.glb")).size).toBeLessThan(statSync(kit("city-kit.glb")).size);
  });
});
