import { describe, expect, it } from "vitest";

import {
  COLLAB_WORDS, RULES_WORDS, confirmationsHref, guardianMustAct, outstanding, outstandingWords, promptFor, returnPath, wordingMoved,
} from "@/lib/confirmations-live";

/* P8-FE-03 / -04 / -07 — the two confirmations an athlete owes before a
   new deal, and which refusal leads to which prompt. */

const standing = (current: boolean, required = false, byGuardian = false) => ({ current, required, byGuardian });

describe("what is outstanding", () => {
  it("lists nothing when both are current", () => {
    expect(outstanding(standing(true), standing(true))).toEqual([]);
    expect(outstandingWords([], false)).toBeNull();
  });
  it("lists the rules first, then the agreement, carrying required and byGuardian", () => {
    const out = outstanding(standing(false, true), standing(false, false, true));
    expect(out.map((o) => o.kind)).toEqual(["rules", "collab"]);
    expect(out[0]).toEqual({ kind: "rules", required: true, byGuardian: false });
    expect(out[1]).toEqual({ kind: "collab", required: false, byGuardian: true });
  });
  it("skips a standing that couldn't be loaded", () => {
    expect(outstanding(null, standing(false))).toEqual([{ kind: "collab", required: false, byGuardian: false }]);
  });
});

describe("the home banner", () => {
  it("names what to confirm and says a deal waits when a switch is on", () => {
    const w = outstandingWords(outstanding(standing(false, true), standing(false)), false);
    expect(w?.title).toMatch(/before your next deal/i);
    expect(w?.text).toMatch(/your own rules and the Content Collaboration Agreement/);
    expect(w?.text).toMatch(/a new deal waits/);
  });
  it("is quieter when nothing is enforced", () => {
    const w = outstandingWords(outstanding(standing(false), null), false);
    expect(w?.title).toBe("One thing to confirm");
    expect(w?.text).not.toMatch(/waits/);
  });
  it("tells a minor's own login that the guardian does it", () => {
    const w = outstandingWords(outstanding(standing(false, true, true), null), false);
    expect(w?.title).toMatch(/guardian/);
    expect(w?.text).toMatch(/from their own login before you can take a new deal/);
  });
  it("speaks to the guardian acting for the athlete", () => {
    const w = outstandingWords(outstanding(standing(false, false, true), null), true);
    expect(w?.text).toMatch(/the athlete's own rules/);
  });
});

describe("the confirmations page link", () => {
  it("carries a same-site return path and drops anything else", () => {
    expect(confirmationsHref("/athlete/orders/o1")).toBe("/athlete/confirmations?return=%2Fathlete%2Forders%2Fo1");
    expect(confirmationsHref("https://evil.example")).toBe("/athlete/confirmations");
    expect(confirmationsHref("//evil.example")).toBe("/athlete/confirmations");
    /* A browser reads `/\host` as `//host` (QA 2026-10-23 — this one left the site). */
    expect(confirmationsHref("/\\evil.example")).toBe("/athlete/confirmations");
    expect(confirmationsHref("/\tevil")).toBe("/athlete/confirmations");
    expect(confirmationsHref(null)).toBe("/athlete/confirmations");
  });
  it("reads the return path back the same way", () => {
    expect(returnPath("/athlete/orders/o1")).toBe("/athlete/orders/o1");
    expect(returnPath(["/athlete/offers"])).toBe("/athlete/offers");
    expect(returnPath("//evil.example")).toBe("/athlete");
    expect(returnPath("/\\evil.example")).toBe("/athlete");
    expect(returnPath("/\\\\evil.example")).toBe("/athlete");
    expect(returnPath("/\n/evil.example")).toBe("/athlete");
    expect(returnPath("javascript:alert(1)")).toBe("/athlete");
    expect(returnPath("https://evil.example")).toBe("/athlete");
    expect(returnPath(["/a", "/b"])).toBe("/a");
    expect(returnPath(undefined, "/athlete/orders")).toBe("/athlete/orders");
  });
});

describe("refusals", () => {
  const body = (code: string, message = "") => ({ error: { code, message } });

  it("sends a 409 required to its prompt", () => {
    expect(promptFor(409, body("rules_attestation_required"))).toBe("rules");
    expect(promptFor(409, body("collab_agreement_required"))).toBe("collab");
    expect(promptFor(409, body("deal_paused"))).toBeNull();
    expect(promptFor(422, body("rules_attestation_required"))).toBeNull();
  });
  it("knows when the wording moved on, including the uncoded agreement change", () => {
    expect(wordingMoved(422, body("rules_attestation_stale"))).toBe("rules");
    expect(wordingMoved(422, body("not_collab_agreement"))).toBe("collab");
    expect(wordingMoved(409, body("agreement_text_changed"))).toBe("collab");
    expect(wordingMoved(409, body("bad_request", "The agreement text has changed since you read it."))).toBe("collab");
    expect(wordingMoved(409, body("bad_request", "Already accepted."))).toBeNull();
    expect(wordingMoved(400, body("validation"))).toBeNull();
  });
  it("spots a minor's own login being refused", () => {
    expect(guardianMustAct(403, body("guardian_must_act"))).toBe(true);
    expect(guardianMustAct(403, body("forbidden"))).toBe(false);
    expect(guardianMustAct(409, body("guardian_must_act"))).toBe(false);
  });
});

describe("wording", () => {
  it("names the version on every tick box", () => {
    expect(RULES_WORDS.checkbox("2026-10-20")).toContain("2026-10-20");
    expect(RULES_WORDS.guardianCheckbox("Maya", "2026-10-20")).toMatch(/for Maya .* 2026-10-20/);
    expect(COLLAB_WORDS.checkbox(2)).toBe("I have read and accept the SponsorX Athlete Content Collaboration Agreement (version 2).");
  });
});
