/**
 * P3-BE-02 — "Admin sees tenant-wide; athlete sees self; guardian sees wards;
 * property manager sees own-property; sponsor sees only ACTIVE athletes on
 * their own campaigns."
 *
 * Five clauses, and the last one has two halves that are easy to half-meet:
 * the sponsor filter must restrict to their OWN campaigns AND to ACTIVE
 * athletes. Dropping the state filter would leak the pipeline — a sponsor
 * learning that a named person was REJECTED, or SUSPENDED mid-campaign, is a
 * disclosure nobody agreed to.
 *
 * These assert the WHERE clause the builder produces, because that is the
 * thing that either restricts the query or does not. A test that stubbed the
 * database and checked which rows came back would only be testing the stub.
 */
import { describe, expect, it } from "vitest";

import { whereFor } from "../src/auth/scope";
import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

const actor = (roles: Role[], over: Partial<Actor> = {}): Actor =>
  ({
    userId: "u", tenantId: "t1", roles,
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
    ...over,
  });

const MATCHES_NOTHING = { id: { in: [] as string[] } };

describe("P3-BE-02 · who sees which athletes", () => {
  it("BTG admin sees the whole tenant", () => {
    expect(whereFor(actor(["BTG_ADMIN"]), "athlete", "read")).toEqual({ AND: [{ tenantId: "t1" }] });
  });

  it("the network manager sees the whole tenant too", () => {
    expect(whereFor(actor(["NETWORK_MGR"]), "athlete", "read")).toEqual({ AND: [{ tenantId: "t1" }] });
  });

  it("an athlete sees exactly themselves", () => {
    expect(whereFor(actor(["ATHLETE"], { athleteId: "ath_1" }), "athlete", "read"))
      .toEqual({ AND: [{ tenantId: "t1", id: "ath_1" }] });
  });

  it("a guardian sees their wards", () => {
    expect(whereFor(actor(["GUARDIAN"], { guardianId: "g_1" }), "athlete", "read"))
      .toEqual({ AND: [{ tenantId: "t1", guardianId: "g_1" }] });
  });

  it("a property manager sees their own property's athletes", () => {
    expect(whereFor(actor(["PROPERTY_MGR"], { propertyId: "prop_1" }), "athlete", "read"))
      .toEqual({ AND: [{ tenantId: "t1", propertyId: "prop_1" }] });
  });

  describe("a sponsor sees only ACTIVE athletes on their own campaigns", () => {
    const sponsor = actor(["SPONSOR_ADMIN"], { sponsorId: "spn_1" });

    /* whereFor wraps the scope in AND so a caller's key cannot overwrite it
       (P8-SEC-02); the scope itself is the one conjunct. */
    const scopeOf = (w: unknown) => (w as { AND: Record<string, unknown>[] }).AND[0]!;

    it("restricts to their own campaigns", () => {
      expect(scopeOf(whereFor(sponsor, "athlete", "read"))).toMatchObject({
        tenantId: "t1",
        orders: { some: { campaign: { is: { sponsorId: "spn_1" } } } },
      });
    });

    /* THE HALF THAT IS EASY TO DROP. Without this the sponsor sees athletes
       who were rejected or suspended — the pipeline, not the roster. */
    it("restricts to ACTIVE athletes", () => {
      expect(scopeOf(whereFor(sponsor, "athlete", "read"))).toMatchObject({ state: "ACTIVE" });
    });

    it("applies both halves together, not either one alone", () => {
      const where = scopeOf(whereFor(sponsor, "athlete", "read"));
      expect(Object.keys(where).sort()).toEqual(["orders", "state", "tenantId"]);
    });

    it("an analyst gets the same restriction as an admin", () => {
      const analyst = actor(["SPONSOR_ANALYST"], { sponsorId: "spn_1" });
      expect(whereFor(analyst, "athlete", "read")).toEqual(whereFor(sponsor, "athlete", "read"));
    });
  });
});

/**
 * A broken actor reaches nothing rather than everything. That state should
 * not exist, and if it ever does, the safe reading of a broken row is that it
 * matches no rows at all.
 */
describe("a missing link matches nothing, never everything", () => {
  it.each([
    [["ATHLETE"], {}],
    [["GUARDIAN"], {}],
    [["PROPERTY_MGR"], {}],
    [["SPONSOR_ADMIN"], {}],
  ])("%s with no linked id", (roles) => {
    const where = whereFor(actor(roles as Role[]), "athlete", "read");
    expect(where).toEqual({ AND: [MATCHES_NOTHING] });
  });

  it("matches nothing rather than returning an empty filter", () => {
    const where = whereFor(actor(["ATHLETE"]), "athlete", "read");
    expect(where).not.toEqual({});
  });
});
