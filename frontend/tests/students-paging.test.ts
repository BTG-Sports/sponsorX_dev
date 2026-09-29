import { describe, expect, it } from "vitest";

import {
  CLAIM_KEYS,
  LEDGER_KEYS,
  STUDENT_GROUPS,
  STUDENT_GROUP_KEYS,
  keyedListQuery,
  prospectStatesFor,
} from "@/lib/students-live";

/* The advisor desk and the NEXT portal, server-paged (2026-09-29): the pure
   URL → API-query helpers the server pages use. */

describe("keyedListQuery — a second list's own URL keys", () => {
  it("reads its own keys, not ?page / ?size", () => {
    expect(keyedListQuery({ page: "4", size: "60", cpage: "2", csize: "24" }, CLAIM_KEYS)).toBe("?page=2&size=24");
    expect(keyedListQuery({ lpage: "3" }, LEDGER_KEYS)).toBe("?page=3&size=12");
  });

  it("always sends page (paged mode on) and falls back on junk", () => {
    expect(keyedListQuery({}, CLAIM_KEYS)).toBe("?page=1&size=12");
    expect(keyedListQuery({ cpage: "-2", csize: "1000" }, CLAIM_KEYS)).toBe("?page=1&size=12");
    expect(keyedListQuery({ cpage: ["5", "6"] }, CLAIM_KEYS)).toBe("?page=5&size=12");
  });

  it("adds only non-empty extras", () => {
    expect(keyedListQuery({}, CLAIM_KEYS, { state: "SUBMITTED", q: "" })).toBe("?page=1&size=12&state=SUBMITTED");
  });
});

describe("prospect filter → API states", () => {
  it("maps the two filters and nothing else", () => {
    expect(prospectStatesFor("open")).toBe("SUBMITTED,ACCEPTED");
    expect(prospectStatesFor("rejected")).toBe("REJECTED");
    expect(prospectStatesFor("")).toBe("");
    expect(prospectStatesFor("ALL,DROP")).toBe("");
  });
});

describe("the desk's groups", () => {
  it("are the API's five ?group keys, in desk order", () => {
    expect(STUDENT_GROUP_KEYS).toEqual(["waiting", "approved", "with", "roster", "closed"]);
    for (const g of STUDENT_GROUPS) expect(g.tab && g.title && g.hint).toBeTruthy();
  });
});
