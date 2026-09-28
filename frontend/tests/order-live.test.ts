import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  acceptBlocker,
  canonicaliseAgreementBody,
  type ApiOrder,
} from "../src/lib/order-live";
import {
  canonicaliseAgreementBody as backendCanonicalise,
  hashAgreementBody,
} from "../../backend/src/domain/agreement-hash";

/* --------------------------------------------------------------------------
   P5-FE-01 — the acceptance's one hard rule, pinned across the workspace
   boundary: the fingerprint the accept action sends (frontend
   canonicalisation + sha256) must equal the one the API checks (backend
   hashAgreementBody) for the real issued text and for every kind of
   transport noise. If these ever disagree, every honest acceptance fails.
   -------------------------------------------------------------------------- */

const frontendHash = (body: string) =>
  "sha256:" + createHash("sha256").update(canonicaliseAgreementBody(body), "utf8").digest("hex");

const TEMPLATE = readFileSync(
  new URL("../../backend/agreements/CAMPAIGN_ORDER.v1.txt", import.meta.url),
  "utf8",
);

describe("canonicalisation parity with the API", () => {
  it("hashes the issued Campaign Order text exactly as the API does", () => {
    expect(frontendHash(TEMPLATE)).toBe(hashAgreementBody(TEMPLATE));
  });

  it.each([
    ["BOM", "﻿Terms\n"],
    ["CRLF", "Line one\r\nLine two\r\n"],
    ["lone CR", "Line one\rLine two"],
    ["trailing whitespace", "Terms.   \n\n\t"],
    ["internal blank lines kept", "A\n\n\nB"],
    ["case and double spaces kept", "Shall  not"],
  ])("agrees on %s", (_label, body) => {
    expect(canonicaliseAgreementBody(body)).toBe(backendCanonicalise(body));
    expect(frontendHash(body)).toBe(hashAgreementBody(body));
  });

  it("a real edit changes the fingerprint", () => {
    expect(frontendHash(TEMPLATE.replace("You agree to create", "You may create"))).not.toBe(frontendHash(TEMPLATE));
    expect(frontendHash("A\n\nB")).not.toBe(frontendHash("A\nB"));
  });
});

function order(over: Partial<ApiOrder> = {}): ApiOrder {
  return {
    id: "ord_1", state: "SENT", jobId: "SX-01", jobName: "Story Drop",
    campaign: { id: "c", name: "Fall", sponsorName: "Bowie", startDate: "x", endDate: "y" },
    athlete: { id: "a", displayName: "JORDAN" },
    usageRights: "Organic", exclusivity: null, dueDate: "2026-10-20T00:00:00.000Z", acceptedAt: null,
    compensation: 40_000,
    guardian: { status: "not-required", name: null },
    agreement: { id: "agr_1", kind: "CAMPAIGN_ORDER", version: 1, bodyHash: "sha256:x", body: "Terms" },
    acceptance: null,
    ...over,
  };
}

describe("acceptBlocker", () => {
  it("lets an adult athlete accept a sent order with issued text", () => {
    expect(acceptBlocker(order(), true)).toBeNull();
  });
  it("refuses when the text can't be served — never accept unseen words", () => {
    expect(acceptBlocker(order({ agreement: { ...order().agreement!, body: null } }), true)).toMatch(/can't be shown/);
    expect(acceptBlocker(order({ agreement: null }), true)).toMatch(/hasn't been issued/);
  });
  it("names the guardian gate for a minor", () => {
    expect(acceptBlocker(order({ guardian: { status: "unverified", name: "Pat Ellis" } }), true)).toMatch(/Pat Ellis is linked but not verified/);
    expect(acceptBlocker(order({ guardian: { status: "missing", name: null } }), true)).toMatch(/under 18/);
    expect(acceptBlocker(order({ guardian: { status: "ready", name: "Pat" } }), true)).toBeNull();
  });
  it("a guardian can read but not accept (D1)", () => {
    expect(acceptBlocker(order(), false)).toMatch(/Only the athlete/);
  });
  it("a draft order isn't ready", () => {
    expect(acceptBlocker(order({ state: "DRAFT" }), true)).toMatch(/drafting/);
  });
});
