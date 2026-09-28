import { describe, expect, it } from "vitest";

import { diff } from "../src/components/audit-explorer";

/* P8-FE-02 — an audit row explains itself field by field; unchanged keys
   are dropped and a key present on one side only still shows. */
describe("audit diff", () => {
  it("lists only what moved", () => {
    expect(diff({ state: "BTG_REVIEW", n: 1 }, { state: "APPROVED", n: 1 })).toEqual([
      { key: "state", from: "BTG_REVIEW", to: "APPROVED" },
    ]);
  });
  it("shows added and removed keys", () => {
    expect(diff(null, { reason: "Show the logo" })).toEqual([{ key: "reason", from: "—", to: "Show the logo" }]);
    expect(diff({ a: { x: 1 } }, {})).toEqual([{ key: "a", from: '{"x":1}', to: "—" }]);
  });
});
