import { z } from "./zod";

import { ASSET_KINDS, GRANTOR_KINDS, SOURCE_KINDS } from "../domain/content-rights";
import { CONTRIBUTION_KINDS } from "../domain/dmv-pools";

/* --------------------------------------------------------------------------
   SponsorX NEXT rights, featured athletes and the DMV pool — P9-BE-10, -11,
   -14 — on the wire.
   -------------------------------------------------------------------------- */

export const EditionAssetInput = z
  .object({
    kind: z.enum(ASSET_KINDS),
    title: z.string().min(1).max(300),
    sourceKind: z.enum(SOURCE_KINDS),
    studentId: z.string().min(1).nullable().optional(),
    athleteId: z.string().min(1).nullable().optional(),
    r2Key: z.string().min(1).max(500).nullable().optional(),
  })
  .meta({ id: "EditionAssetInput" });

export const ContentRightInput = z
  .object({
    grantorKind: z.enum(GRANTOR_KINDS),
    grantorRef: z.string().min(1).max(200),
    mayPublishDigital: z.boolean().optional(),
    mayPublishPrint: z.boolean().optional(),
    mayPromote: z.boolean().optional(),
    /** Never defaulted on — for BTG content above all. */
    mayReuseCommercially: z.boolean().optional(),
    territory: z.string().max(100).nullable().optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable().optional(),
    attribution: z.string().max(300).nullable().optional(),
    acceptanceId: z.string().min(1).nullable().optional(),
    licenseRef: z.string().min(1).max(200).nullable().optional(),
  })
  .meta({ id: "ContentRightInput", description: "Consent grantors point at an acceptance; BTG / third parties at a licence. Exactly one." });

export const AssetCampaignInput = z.object({ campaignId: z.string().min(1) }).meta({ id: "AssetCampaignInput" });

export const SubjectConsentInput = z
  .object({
    agreementId: z.string().min(1),
    subjectKind: z.enum(["ATHLETE", "STUDENT"]),
    subjectId: z.string().min(1),
    guardianId: z.string().min(1).nullable().optional(),
    bodyHashShown: z.string().length(64),
  })
  .meta({ id: "SubjectConsentInput", description: "Consent for a subject with no login (spec §6.2). A minor's is signed by their verified guardian." });

export const FeaturedAthleteInput = z
  .object({
    displayName: z.string().min(1).max(100),
    sport: z.string().min(1).max(60),
    propertyId: z.string().min(1),
    stateCode: z.string().length(2).nullable().optional(),
    position: z.string().max(60).nullable().optional(),
  })
  .meta({ id: "FeaturedAthleteInput" });

export const ClaimInput = z
  .object({
    claimantName: z.string().min(1).max(200),
    claimantEmail: z.email(),
    birthDate: z.iso.date().nullable().optional(),
    ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).nullable().optional(),
  })
  .meta({ id: "ClaimInput", description: "'That's me' — the athlete's own claim on a featured profile." });

export const RosterInput = z
  .object({ entries: z.array(z.object({ legalName: z.string().min(1).max(200), gradYear: z.number().int().min(2020).max(2040).nullable().optional() })).min(1).max(2000) })
  .meta({ id: "RosterInput" });

export const ContributionInput = z
  .object({ studentId: z.string().min(1), kind: z.enum(CONTRIBUTION_KINDS as [string, ...string[]]) })
  .meta({ id: "ContributionInput", description: "FEATURE 5 · PHOTO_PACKAGE 3 · INTERVIEW 3 · VIDEO 5 units." });
