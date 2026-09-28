import type { ApiEditionState } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   P9-FE-09 — the rights ledger and clearance queue as
   GET /editions/:id/rights-ledger answers them.

   Clearance is the API's (rightsGap — the query the production transition
   itself runs), never recomputed here: `clearedDigital` is "a right covering
   digital is in force on the publish target", `clearedPrint` the same for
   print on the print date. The queue is simply every asset one of those two
   is false for, with who can grant what is missing.
   -------------------------------------------------------------------------- */

export type GrantorKind = "STUDENT" | "ATHLETE" | "GUARDIAN" | "BTG" | "THIRD_PARTY";
export type SourceKind = "STUDENT" | "ATHLETE" | "BTG" | "THIRD_PARTY";
export type AssetKind = "ARTICLE" | "PHOTO" | "PHOTO_PACKAGE" | "INTERVIEW" | "VIDEO" | "AD_CREATIVE";

export type ApiRight = {
  id: string;
  grantorKind: GrantorKind;
  grantorRef: string;
  mayPublishDigital: boolean;
  mayPublishPrint: boolean;
  mayPromote: boolean;
  mayReuseCommercially: boolean;
  territory: string | null;
  startsAt: string;
  endsAt: string | null;
  attribution: string | null;
  acceptanceId: string | null;
  licenseRef: string | null;
};

export type ApiRightsAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  sourceKind: SourceKind;
  studentId: string | null;
  athleteId: string | null;
  campaignId: string | null;
  clearedDigital: boolean;
  clearedPrint: boolean;
  /** absent for a role with no contentRight read */
  rights?: ApiRight[];
};

export type ApiRightsLedger = {
  edition: { id: string; label: string; state: ApiEditionState; publishTarget: string; printDate: string | null };
  assets: ApiRightsAsset[];
};

/** Consent grantors point at a signed acceptance; the rest at a licence. */
export const CONSENT_GRANTORS: GrantorKind[] = ["STUDENT", "ATHLETE", "GUARDIAN"];

export type QueueItem = {
  asset: ApiRightsAsset;
  missing: string;
  /** Who can grant it, by the asset's source. */
  grantedBy: string;
};

export function clearanceQueue(assets: ApiRightsAsset[]): QueueItem[] {
  return assets
    .filter((a) => !a.clearedDigital || !a.clearedPrint)
    .map((a) => ({
      asset: a,
      missing: !a.clearedDigital && !a.clearedPrint ? "Digital + print" : !a.clearedDigital ? "Digital" : "Print",
      grantedBy:
        a.sourceKind === "STUDENT"
          ? "the student's consent (their guardian's, if a minor)"
          : a.sourceKind === "ATHLETE"
            ? "the athlete's consent (their guardian's, if a minor)"
            : a.sourceKind === "BTG"
              ? "a SponsorX licence record"
              : "the third party's licence",
    }));
}

export function coverage(assets: ApiRightsAsset[]) {
  return {
    total: assets.length,
    digital: assets.filter((a) => a.clearedDigital).length,
    print: assets.filter((a) => a.clearedPrint).length,
  };
}

/** One ledger row per grant, with its asset. */
export function ledgerRows(assets: ApiRightsAsset[]): Array<ApiRight & { asset: string; assetKind: AssetKind }> {
  return assets.flatMap((a) => (a.rights ?? []).map((r) => ({ ...r, asset: a.title, assetKind: a.kind })));
}

/** The forward move from each state — the menu the advance control offers.
 *  The API's state machine decides; CANCELLED is deliberately not offered
 *  from a one-click control. */
export const NEXT_STATE: Partial<Record<ApiEditionState, ApiEditionState>> = {
  PLANNING: "SELLING",
  SELLING: "CLOSED",
  CLOSED: "IN_PRODUCTION",
  IN_PRODUCTION: "PUBLISHED_DIGITAL",
  PUBLISHED_DIGITAL: "PRINTED",
  PRINTED: "DISTRIBUTED",
};

export const STATE_VERB: Partial<Record<ApiEditionState, string>> = {
  SELLING: "Open for sale",
  CLOSED: "Close ads",
  IN_PRODUCTION: "Send to production",
  PUBLISHED_DIGITAL: "Publish digital",
  PRINTED: "Mark printed",
  DISTRIBUTED: "Mark distributed",
};
