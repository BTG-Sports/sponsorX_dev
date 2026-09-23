import { describe, expect, it } from "vitest";

import {
  FIELD_DENIALS, canReadField, assertCanReadField, redactFields,
  FieldForbiddenError, type ProtectedField,
} from "../src/auth/fields";
import { ROLES } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   Field-level denials — P2-SEC-02, matrix §7.

   The acceptance names two cases explicitly: SPONSOR_ADMIN denied
   athleteRate.amount, and ATHLETE denied campaign.budget. Both are below, and
   so is every other row of §7.1 and §7.2 — the roadmap calls field-level
   authz "the real risk", and a mechanism that only covers the two examples
   would be the decorative version of it.
   -------------------------------------------------------------------------- */

describe("the two cases the acceptance names", () => {
  it("denies SPONSOR_ADMIN athleteRate.amount", () => {
    expect(canReadField(["SPONSOR_ADMIN"], "athleteRate.amount")).toBe(false);
  });

  it("denies ATHLETE campaign.budget", () => {
    expect(canReadField(["ATHLETE"], "campaign.budget")).toBe(false);
  });
});

describe("the margin is protected from both sides (§7.1)", () => {
  it("hides athlete pay from sponsors", () => {
    for (const role of ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const) {
      expect(canReadField([role], "nilJob.athleteBasePay")).toBe(false);
      expect(canReadField([role], "athleteRate.amount")).toBe(false);
      expect(canReadField([role], "campaignOrder.compensation")).toBe(false);
      expect(canReadField([role], "earning.amount")).toBe(false);
    }
  });

  it("hides sponsor spend from athletes", () => {
    for (const field of ["campaign.budget", "campaign.guarantee", "campaign.value",
                         "nilJob.sponsorPrice"] as ProtectedField[]) {
      expect(canReadField(["ATHLETE"], field)).toBe(false);
      expect(canReadField(["GUARDIAN"], field)).toBe(false);
    }
  });

  it("closes the route through the order, which §12 puts compensation inside", () => {
    /* Denying athleteRate while leaving campaignOrder.compensation open
       defeats the whole rule — a sponsor reads the order instead. */
    expect(canReadField(["SPONSOR_ADMIN"], "campaignOrder.compensation")).toBe(false);
  });

  it("hides the sell price from the athlete side too", () => {
    /* compensation and sellPrice together ARE the margin. A role shown one
       and denied the other can still compute it. */
    expect(canReadField(["ATHLETE"], "campaignOrder.sellPrice")).toBe(false);
    expect(canReadField(["CAMPAIGN_MGR"], "campaignOrder.sellPrice")).toBe(true);
  });

  it("lets BTG see both sides, which is the point of BTG", () => {
    for (const field of Object.keys(FIELD_DENIALS) as ProtectedField[]) {
      if (field === "rewardClaim.fanContact") continue; // SUPER_ADMIN/BTG_ADMIN only
      expect(canReadField(["SUPER_ADMIN"], field), field).toBe(true);
    }
  });
});

describe("personal data (§7.2)", () => {
  it("keeps an athlete's contact details from sponsors", () => {
    for (const field of ["athlete.email", "athlete.phone", "athlete.legalName"] as ProtectedField[]) {
      expect(canReadField(["SPONSOR_ADMIN"], field)).toBe(false);
    }
  });

  it("keeps a date of birth to the roles that need it", () => {
    /* §26 — minors. An age band is enough for anyone else. */
    for (const role of ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR", "ATHLETE", "GUARDIAN"] as const) {
      expect(canReadField([role], "athlete.dateOfBirth"), role).toBe(true);
    }
    for (const role of ["SALES", "CAMPAIGN_MGR", "FINANCE", "PROPERTY_MGR",
                        "SPONSOR_ADMIN", "SPONSOR_ANALYST", "SERVICE"] as const) {
      expect(canReadField([role], "athlete.dateOfBirth"), role).toBe(false);
    }
  });

  it("gives a sponsor a conflict yes/no and never the list", () => {
    expect(canReadField(["SPONSOR_ADMIN"], "athlete.restrictions")).toBe(false);
    expect(canReadField(["NETWORK_MGR"], "athlete.restrictions")).toBe(true);
  });

  it("keeps fan contact from everyone but SUPER_ADMIN and BTG_ADMIN", () => {
    /* Including the sponsor who funded the reward: a fan consented to a
       coupon, not to being handed to a brand. */
    const readers = ROLES.filter((r) => canReadField([r], "rewardClaim.fanContact"));
    expect(readers.sort()).toEqual(["BTG_ADMIN", "SUPER_ADMIN"]);
  });
});

describe("a second role does not widen a denial", () => {
  it("denies if ANY held role is denied", () => {
    /* Unlike a scope, where the widest wins. The point of a field denial is
       that this PERSON must not see the value, so holding a second hat does
       not reveal it. */
    expect(canReadField(["NETWORK_MGR", "SPONSOR_ADMIN"], "athleteRate.amount")).toBe(false);
    expect(canReadField(["NETWORK_MGR"], "athleteRate.amount")).toBe(true);
  });
});

describe("redaction drops the columns rather than blanking them", () => {
  const order = {
    id: "ord_1", jobId: "SX-02", compensation: 10000, sellPrice: 20000,
    usageRights: "Organic social",
  };

  it("removes what a sponsor may not see", () => {
    const seen = redactFields(["SPONSOR_ADMIN"], "campaignOrder", order);
    expect(seen).not.toHaveProperty("compensation");
    expect(seen).toHaveProperty("sellPrice");
    expect(seen).toMatchObject({ id: "ord_1", usageRights: "Organic social" });
  });

  it("removes what an athlete may not see", () => {
    const seen = redactFields(["ATHLETE"], "campaignOrder", order);
    expect(seen).toHaveProperty("compensation");
    expect(seen).not.toHaveProperty("sellPrice");
  });

  it("leaves unprotected fields alone and does not mutate the source", () => {
    const seen = redactFields(["SPONSOR_ADMIN"], "campaignOrder", order);
    expect(Object.keys(seen)).toContain("jobId");
    expect(order.compensation).toBe(10000);
  });

  it("throws where a caller wants a hard failure rather than a quiet drop", () => {
    expect(() => assertCanReadField(["ATHLETE"], "campaign.budget"))
      .toThrow(FieldForbiddenError);
    expect(() => assertCanReadField(["BTG_ADMIN"], "campaign.budget")).not.toThrow();
  });
});

describe("the table is complete", () => {
  it("names only roles that exist", () => {
    for (const [field, denied] of Object.entries(FIELD_DENIALS)) {
      for (const role of denied) {
        expect(ROLES, `${field} denies unknown role ${role}`).toContain(role);
      }
    }
  });

  it("covers every field §7.1 and §7.2 list", () => {
    expect(Object.keys(FIELD_DENIALS).sort()).toEqual([
      "athlete.dateOfBirth", "athlete.email", "athlete.legalName", "athlete.phone",
      "athlete.restrictions", "athleteRate.amount", "athleteScore.value",
      "campaign.budget", "campaign.guarantee", "campaign.value",
      "campaignOrder.compensation", "campaignOrder.sellPrice", "earning.amount",
      "nilJob.athleteBasePay", "nilJob.sponsorPrice", "rewardClaim.fanContact",
      "sponsor.billingReference",
    ]);
  });
});
