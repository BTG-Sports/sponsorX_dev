/**
 * BTG's view of an organisation after the system has decided — 2S1-BE-06
 * (with 2S1-BE-07's flags), for 2S1-FE-05's profile page and 2S1-FE-07's
 * New sign-ups desk.
 *
 *   - the SIGN-UPS list: every submitted organisation as the desk shows it —
 *     approved automatically, waiting for BTG with its reasons, flagged
 *     after a document change, or rejected;
 *   - the PROFILE: its details, the checklist as it stood when it was
 *     approved (or the live one while it waits), its documents with their
 *     history, its activity from the audit log, and what BTG may decide.
 *
 * Reads only. Decisions are decideOnboarding's; a document opens through
 * viewOnboardingDocument's five-minute audited link.
 */
import { z } from "zod";

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { ContactSchema, DECISIONS, DOCUMENT_LABEL, approvalVerdict, isCurrent, type Decision, type DocumentKind, type OnboardingState } from "./onboarding-rules";
import { approvalFactsFor, checklistOf, decisionAllowed, emailConfirmed, ONBOARDING_SELECT, primaryEmail, type OnboardingRow } from "./onboarding";

/** The desk's three words for a sign-up (frontend lib/new-signups-live.ts SignupState). */
export type SignupState = "AUTO_APPROVED" | "NEEDS_REVIEW" | "REJECTED";

const TYPE_WORD: Record<string, string> = { TEAM: "Team", SCHOOL: "School", EVENT: "Event", MEDIA: "Media", VIRTUAL: "Virtual", AGENCY: "Agency" };

/** Where an organisation stands on the desk: held (waiting, or flagged after approval), rejected, or approved. */
export function signupStateOf(r: Pick<OnboardingRow, "state" | "flags">): SignupState {
  if (r.state === "REJECTED") return "REJECTED";
  if (r.state === "PENDING_REVIEW" || r.flags.length > 0 || r.state === "SUSPENDED") return "NEEDS_REVIEW";
  return "AUTO_APPROVED";
}

function signupRow(r: OnboardingRow) {
  const state = signupStateOf(r);
  const place = r.stateCode ? ` · ${r.stateCode}` : "";
  return {
    id: r.id,
    kind: "ORGANIZATION" as const,
    name: r.orgName,
    sub: `${TYPE_WORD[r.orgType] ?? r.orgType}${place}`,
    signedUpAt: r.submittedAt ?? r.createdAt,
    state,
    reasons: r.state === "PENDING_REVIEW" ? r.reviewReasons : r.state === "SUSPENDED" ? [`Suspended by BTG${r.reviewNotes ? `: ${r.reviewNotes}` : ""}`] : r.flags,
    /* The raw facts, for a screen that wants more than the desk's three words. */
    onboardingState: r.state as OnboardingState,
    autoApproved: r.autoApproved,
    approvedAt: r.state === "APPROVED" || r.state === "SUSPENDED" || (r.state === "REJECTED" && r.propertyId) ? r.decidedAt : null,
    flagged: r.flags.length > 0,
  };
}

/**
 * GET /onboarding/signups — every organisation that has submitted, newest
 * first: the desk's rows. Drafts are not sign-ups yet; an application BTG
 * asked to change is with the applicant.
 */
export async function listOrganizationSignups(actor: Actor) {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const rows = await prisma.propertyOnboarding.findMany({
    where: { ...whereFor(actor, "propertyOnboarding", "read"), state: { in: ["PENDING_REVIEW", "APPROVED", "SUSPENDED", "REJECTED"] } },
    select: ONBOARDING_SELECT,
    orderBy: { submittedAt: "desc" },
    take: 300,
  });
  return { signups: rows.map(signupRow) };
}

/** What each audited moment reads as in the profile's activity. */
function activityText(action: string, after: Record<string, unknown>): string | null {
  const note = typeof after.notes === "string" && after.notes ? `: ${after.notes}` : "";
  const doc = () => {
    const kind = typeof after.kind === "string" ? after.kind : "";
    const label = DOCUMENT_LABEL[kind as DocumentKind] ?? kind;
    return `${label}${typeof after.stateCode === "string" && after.stateCode ? ` (${after.stateCode})` : ""}`;
  };
  switch (action) {
    case "onboarding.submit": return "Submitted";
    case "onboarding.emailConfirmed": return "Contact email confirmed";
    case "onboarding.confirmEmailResent": return "Confirmation link sent again";
    case "onboarding.needsReview": return `Held for BTG’s review${Array.isArray(after.reasons) && after.reasons.length ? `: ${after.reasons.join("; ")}` : ""}`;
    case "onboarding.autoApprove": return "Approved automatically";
    case "onboarding.approve": return "Approved by BTG";
    case "onboarding.request_changes": return `Changes requested${note}`;
    case "onboarding.reject": return `${after.afterApproval ? "Rejected after approval" : "Rejected"}${note}`;
    case "onboarding.suspend": return `Suspended${note}`;
    case "onboarding.reinstate": return "Reinstated";
    case "onboarding.documentAdded": return `Document added: ${doc()}`;
    case "onboarding.documentReplaced": return `Document replaced: ${doc()}`;
    case "onboarding.documentRemoved": return `Document removed: ${doc()}`;
    default: return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The checklist as it stood when the system approved — or null for one BTG approved by hand. */
function snapshot(r: Pick<OnboardingRow, "approvalChecks">) {
  const s = r.approvalChecks;
  if (!isRecord(s) || !Array.isArray(s.checks)) return null;
  return {
    at: typeof s.at === "string" ? s.at : null,
    checks: (s.checks as unknown[]).filter(isRecord).map((c) => ({ key: String(c.key ?? ""), label: String(c.label ?? ""), ok: c.ok === true })),
  };
}

/**
 * GET /onboarding/:id/profile — the page BTG's email links to: who the
 * organisation is, the checklist (as approved, or live while it waits), its
 * documents with their history (opened one at a time through the audited
 * five-minute link), its activity, and the decisions open to BTG now.
 */
export async function getOrganizationProfile(actor: Actor, id: string) {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const row = await prisma.propertyOnboarding.findFirst({ where: { ...whereFor(actor, "propertyOnboarding", "read"), id }, select: ONBOARDING_SELECT });
  if (!row) throw new ForbiddenError("propertyOnboarding", "read");

  const [facts, trail, logins] = await Promise.all([
    approvalFactsFor(prisma, row),
    prisma.auditLog.findMany({
      where: { tenantId: row.tenantId, entity: "PropertyOnboarding", entityId: row.id },
      select: { at: true, action: true, after: true, actorId: true },
      orderBy: { at: "asc" },
      take: 200,
    }),
    row.propertyId && row.property
      ? prisma.user.findMany({
          /* tenant-scope: the organisation's own managers, in the tenant its onboarding provisioned (the Property's). */
          where: { tenantId: row.property.tenantId, propertyId: row.propertyId },
          select: { email: true, disabledAt: true, clerkId: true },
        })
      : Promise.resolve([]),
  ]);
  const live = approvalVerdict(facts);
  const contacts = z.array(ContactSchema).safeParse(row.contacts);
  const primary = contacts.success ? contacts.data.find((c) => c.primary) : undefined;
  const details = isRecord(row.details) ? row.details : {};

  const allowed = (Object.keys(DECISIONS) as Decision[]).filter((d) => decisionAllowed(d, row.state as OnboardingState, Boolean(row.propertyId)));

  return {
    ...signupRow(row),
    orgType: row.orgType,
    stateCode: row.stateCode,
    details: [
      { label: "Type", value: TYPE_WORD[row.orgType] ?? row.orgType },
      ...(row.stateCode ? [{ label: "State", value: row.stateCode }] : []),
      ...(typeof details.legalEntityName === "string" ? [{ label: "Legal entity", value: details.legalEntityName }] : []),
      ...(Array.isArray(details.statesOperatedIn) ? [{ label: "Operates in", value: details.statesOperatedIn.join(", ") }] : []),
      ...(primary ? [{ label: "Primary contact", value: `${primary.name} · ${primary.role}` }, { label: "Contact email", value: primary.email }] : []),
      { label: "Email", value: emailConfirmed(row) ? "Confirmed" : "Not confirmed yet" },
      { label: "Listing access", value: row.property?.listingAccessAt ? "On" : "Off" },
      ...(row.property?.payoutsHeldAt ? [{ label: "Payouts", value: "On hold" }] : []),
    ],
    contactEmail: primaryEmail(row),
    /* The checklist as approved; while it waits (or for a manual approval), the live one. */
    checksAt: snapshot(row)?.at ?? null,
    checks: snapshot(row)?.checks ?? live.checks,
    liveChecks: live.checks,
    nameTakenBy: facts.nameTakenBy,
    reviewReasons: row.reviewReasons,
    flags: row.flags,
    flaggedAt: row.flaggedAt,
    reviewNotes: row.reviewNotes,
    decidedAt: row.decidedAt,
    requirements: checklistOf(row),
    documents: row.documents
      .filter((d) => d.uploadedAt)
      .map((d) => ({
        id: d.id, kind: d.kind, stateCode: d.stateCode, filename: d.filename, contentType: d.contentType, bytes: d.bytes,
        label: d.stateCode ? `${DOCUMENT_LABEL[d.kind as DocumentKind] ?? d.kind} (${d.stateCode})` : DOCUMENT_LABEL[d.kind as DocumentKind] ?? d.kind,
        uploadedAt: d.uploadedAt, expiresOn: d.expiresOn, current: isCurrent(d), replacedAt: d.replacedAt, removedAt: d.removedAt,
      })),
    activity: trail
      .map((t) => ({ at: t.at, text: activityText(t.action, isRecord(t.after) ? t.after : {}), byBtg: Boolean(t.actorId) }))
      .filter((a): a is { at: Date; text: string; byBtg: boolean } => a.text !== null),
    logins: logins.map((l) => ({ email: l.email, switchedOff: Boolean(l.disabledAt), signedIn: !l.clerkId.startsWith("invite:") })),
    decisions: allowed,
  };
}

export type OrganizationProfile = Awaited<ReturnType<typeof getOrganizationProfile>>;
