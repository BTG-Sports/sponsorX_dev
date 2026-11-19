/* POL-BE-111 — no upload without a real-file test. Every domain file that
   presigns an upload (private or public) must be driven by a test that PUTs
   a real file to a signature-checking store: private-upload-pins,
   public-upload-pins, or the flow's own real-store test listed below. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
/* Real-store tests besides the two pins tests: each PUTs through the signed URL itself. */
const OWN_REAL_STORE_TESTS = ["virtual-creative.test.ts", "p9-be-25-edition-content-uploads.test.ts", "p9-be-27-cover-press-pdf.test.ts"];

describe("POL-BE-111 · every upload has a real-file test", () => {
  it("each domain file that presigns an upload is imported by a real-store test", () => {
    const dir = join(root, "src/domain");
    const uploaders = readdirSync(dir).filter((f) => f.endsWith(".ts") && /presign(Private|Public)Upload\(/.test(readFileSync(join(dir, f), "utf8"))).map((f) => f.replace(/\.ts$/, ""));
    const tests = ["private-upload-pins.test.ts", "public-upload-pins.test.ts", ...OWN_REAL_STORE_TESTS].map((t) => readFileSync(join(root, "tests", t), "utf8"));
    for (const t of tests) expect(t).toMatch(/startObjectStore\(\)/);
    const missing = uploaders.filter((u) => !tests.some((t) => t.includes(`"../src/domain/${u}"`)));
    expect(missing).toEqual([]);
    expect(uploaders.length).toBeGreaterThanOrEqual(18);
  });
});
