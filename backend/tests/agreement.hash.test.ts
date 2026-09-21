import { describe, expect, it } from "vitest";

import {
  bodyHashMatches,
  canonicaliseAgreementBody,
  hashAgreementBody,
} from "../src/domain/agreement-hash";

/* --------------------------------------------------------------------------
   Agreement fingerprinting — P3-BE-06, §12, Guide §08.

   What makes an acceptance hold up is proving which words the signer saw.
   These tests pin the trade at the heart of that: enough normalisation that
   an honest acceptance is not rejected by a line-ending difference, little
   enough that a real edit cannot slip through.

   The second half matters more than the first. A hash that is too forgiving
   fails silently and only in the one situation where it is ever consulted —
   a dispute.
   -------------------------------------------------------------------------- */

const BODY = "SponsorX Content Collaboration Agreement\n\n1. The athlete grants...\n";

describe("what must NOT change the hash", () => {
  it("line endings — the same file from Windows and macOS", () => {
    expect(hashAgreementBody(BODY.replace(/\n/g, "\r\n"))).toBe(hashAgreementBody(BODY));
    expect(hashAgreementBody(BODY.replace(/\n/g, "\r"))).toBe(hashAgreementBody(BODY));
  });

  it("a byte-order mark an editor added invisibly", () => {
    expect(hashAgreementBody(`\uFEFF${BODY}`)).toBe(hashAgreementBody(BODY));
  });

  it("trailing whitespace at the very end of the document", () => {
    expect(hashAgreementBody(`${BODY}\n\n   `)).toBe(hashAgreementBody(BODY));
  });
});

describe("what MUST change the hash", () => {
  const base = hashAgreementBody(BODY);

  it("a single changed word", () => {
    expect(hashAgreementBody(BODY.replace("grants", "assigns"))).not.toBe(base);
  });

  it("a changed letter case — 'shall' is not 'Shall' to a court", () => {
    expect(hashAgreementBody(BODY.replace("The athlete", "the athlete"))).not.toBe(base);
  });

  it("a removed paragraph break, which can change how a clause reads", () => {
    expect(hashAgreementBody(BODY.replace("\n\n", "\n"))).not.toBe(base);
  });

  it("internal double spaces", () => {
    expect(hashAgreementBody(BODY.replace("athlete grants", "athlete  grants"))).not.toBe(base);
  });

  it("an inserted clause", () => {
    expect(hashAgreementBody(`${BODY}2. Exclusivity applies.\n`)).not.toBe(base);
  });

  it("a deleted clause", () => {
    expect(hashAgreementBody("SponsorX Content Collaboration Agreement\n")).not.toBe(base);
  });
});

describe("the stored value", () => {
  it("names its algorithm, so it survives an algorithm change", () => {
    /* A bare 64-character string tells a future reader nothing, and these
       rows outlive the code that wrote them. */
    expect(hashAgreementBody(BODY)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is stable across calls", () => {
    expect(hashAgreementBody(BODY)).toBe(hashAgreementBody(BODY));
  });

  it("canonicalisation is idempotent", () => {
    const once = canonicaliseAgreementBody(`\uFEFF${BODY}\r\n  `);
    expect(canonicaliseAgreementBody(once)).toBe(once);
  });
});

describe("comparing what was shown against what is stored", () => {
  it("accepts an exact match", () => {
    const h = hashAgreementBody(BODY);
    expect(bodyHashMatches(h, h)).toBe(true);
  });

  it("refuses a mismatch — stale tab, mid-edit template, or tampering", () => {
    expect(bodyHashMatches(hashAgreementBody(BODY), hashAgreementBody(`${BODY}x`))).toBe(false);
  });

  it("refuses when the stored hash is empty, rather than matching anything", () => {
    /* An agreement row with no hash is a data error. Treating empty as
       "matches" would turn it into an acceptance of unknown text. */
    expect(bodyHashMatches("", "")).toBe(false);
    expect(bodyHashMatches("", hashAgreementBody(BODY))).toBe(false);
  });
});
