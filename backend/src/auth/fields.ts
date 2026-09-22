/**
 * Field-level denials — P2-SEC-02, matrix §7.
 *
 * Row scoping decides which records you reach; this decides which columns
 * survive. The roadmap is explicit that this is where the real leak is: "row
 * scoping is easy; the leak is a screen showing a field the scope forbids",
 * and until now the matrix's §7 existed only as prose and a comment.
 *
 * A TRANSCRIPTION, LIKE `policy.ts`. Same rule: if this file and
 * `documentation/SponsorX-RBAC-Matrix.md` §7 disagree, the document is right.
 * The tables below are §7.1 and §7.2 line by line, denial side first —
 * because a denial list is checkable and an allow list silently permits
 * whatever nobody thought of.
 *
 * WHAT IT DOES NOT DO. It does not know about `own` or `ward`. `ATHLETE` may
 * read `athleteRate.amount` for themselves and not for anyone else, and that
 * is a ROW question that `whereFor()` already answers — by the time a record
 * is in hand, the only question left is whether this role may see the column
 * at all. Where a field is denied to a role "except their own", the row scope
 * is what makes the exception, and the entry here lists only the roles denied
 * outright.
 */

import type { Role } from "./policy";

/** `Model.field`, matching the matrix's own notation. */
export type ProtectedField =
  | "campaign.budget"
  | "campaign.guarantee"
  | "campaign.value"
  | "nilJob.sponsorPrice"
  | "nilJob.athleteBasePay"
  | "athleteRate.amount"
  | "campaignOrder.compensation"
  | "campaignOrder.sellPrice"
  | "earning.amount"
  | "sponsor.billingReference"
  | "athlete.dateOfBirth"
  | "athlete.legalName"
  | "athlete.email"
  | "athlete.phone"
  | "athlete.restrictions"
  | "rewardClaim.fanContact"
  | "athleteScore.value";

const SPONSOR_ROLES = ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const;
const ATHLETE_SIDE = ["ATHLETE", "GUARDIAN"] as const;

/**
 * §7.1 and §7.2, denial side. A role absent from a field's list may read it —
 * subject to the row scope, which is a separate question.
 */
export const FIELD_DENIALS: Record<ProtectedField, readonly Role[]> = {
  /* §7.1 — the margin, protected from both sides. */
  "campaign.budget": [...ATHLETE_SIDE, "PROPERTY_MGR"],
  "campaign.guarantee": [...ATHLETE_SIDE, "PROPERTY_MGR"],
  "campaign.value": [...ATHLETE_SIDE, "PROPERTY_MGR"],
  "nilJob.sponsorPrice": [...ATHLETE_SIDE, "PROPERTY_MGR"],
  "nilJob.athleteBasePay": [...SPONSOR_ROLES],
  "athleteRate.amount": [...SPONSOR_ROLES, "PROPERTY_MGR"],
  /* §12 puts compensation INSIDE the order, which a sponsor can otherwise
     read. Denying athleteRate while leaving this open defeats the rule. */
  "campaignOrder.compensation": [...SPONSOR_ROLES, "PROPERTY_MGR"],
  /* Added with the column (P3-BE-12). It is the other half of the same
     margin: compensation and sellPrice together ARE the margin, so a role
     denied one and shown the other can still compute it. */
  "campaignOrder.sellPrice": [...ATHLETE_SIDE, "PROPERTY_MGR"],
  "earning.amount": [...SPONSOR_ROLES, "CAMPAIGN_MGR", "SALES"],
  "sponsor.billingReference": [
    "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "SPONSOR_ANALYST",
    "ATHLETE", "GUARDIAN", "PROPERTY_MGR", "SERVICE",
  ],

  /* §7.2 — personal data. */
  "athlete.dateOfBirth": [
    "SALES", "CAMPAIGN_MGR", "FINANCE", "PROPERTY_MGR",
    ...SPONSOR_ROLES, "SERVICE",
  ],
  "athlete.legalName": [...SPONSOR_ROLES, "PROPERTY_MGR"],
  "athlete.email": [...SPONSOR_ROLES, "PROPERTY_MGR"],
  "athlete.phone": [...SPONSOR_ROLES, "PROPERTY_MGR"],
  /* A sponsor sees a conflict yes/no, never the list. "Already works with
     Nike" is competitively valuable and not theirs to have. */
  "athlete.restrictions": [...SPONSOR_ROLES],
  /* The only personal data belonging to someone who never logged in. Denied
     even to the sponsor who funded the reward: a fan consented to a coupon,
     not to being handed to a brand. */
  "rewardClaim.fanContact": [
    "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE",
    ...SPONSOR_ROLES, ...ATHLETE_SIDE, "PROPERTY_MGR", "SERVICE",
  ],
  "athleteScore.value": [...SPONSOR_ROLES, "PROPERTY_MGR"],
};

/** May any of this actor's roles read this field? Denied if ANY role is
 *  denied — a denial is not widened by holding a second role, unlike a scope,
 *  because the point is that this person must not see the value. */
export function canReadField(roles: readonly Role[], field: ProtectedField): boolean {
  const denied = FIELD_DENIALS[field];
  return !roles.some((role) => denied.includes(role));
}

export class FieldForbiddenError extends Error {
  readonly status = 403;
  readonly field: string;
  constructor(field: ProtectedField) {
    super(`Not permitted to read ${field}.`);
    this.name = "FieldForbiddenError";
    this.field = field;
  }
}

export function assertCanReadField(
  roles: readonly Role[],
  field: ProtectedField,
): void {
  if (!canReadField(roles, field)) throw new FieldForbiddenError(field);
}

/**
 * Drop every field this actor may not read from a record.
 *
 * Takes the model name so the caller says `redactFields(roles, "campaign",
 * row)` and the keys are matched against `campaign.*`. Returns a new object —
 * mutating the row would leave the caller unsure whether their own variable
 * is safe to log.
 *
 * §7.3's first rule — "derived values inherit the restriction" — is the one
 * this cannot enforce: a cost-per-view computed from a denied budget is a
 * number this function has never seen. Whoever adds an aggregate owns that.
 */
export function redactFields<T extends Record<string, unknown>>(
  roles: readonly Role[],
  model: string,
  row: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const field = `${model}.${key}` as ProtectedField;
    if (field in FIELD_DENIALS && !canReadField(roles, field)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
