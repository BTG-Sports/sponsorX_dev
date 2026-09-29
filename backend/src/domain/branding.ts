/**
 * White-label tenant branding — 2S7-BE-01.
 *
 * "A tenant's branding is served to its portal and renders on its reports."
 * (The portal's own rendering is 2S7-FE-03.)
 *
 * Everyone signed in to a tenant reads its branding — that is what the portal
 * frame renders. BTG_ADMIN sets BTG's; an outside organisation's PROPERTY_MGR
 * sets their own tenant's, never BTG's (scope `own` is checked against the
 * tenant being an operated one). The logo is uploaded straight to the PUBLIC
 * bucket (PNG or JPEG only — no SVG, which can carry script), under a prefix
 * that names the tenant, and a key outside that prefix is refused.
 *
 * Custom domain: readiness only. The host is validated and unique; routing it
 * (DNS, certificates, host → tenant resolution) is a later step.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presignPublicUpload, publicObjectUrl } from "../lib/storage";

export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg" } as const;
export const MAX_LOGO_BYTES = 1024 * 1024;
const HEX = /^#[0-9a-fA-F]{6}$/;
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type Branding = {
  displayName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  reportFooter: string | null;
  customDomain: string | null;
};

export type BrandingInput = Partial<{
  displayName: string | null; logoKey: string | null; primaryColor: string | null; accentColor: string | null;
  reportFooter: string | null; customDomain: string | null;
}>;

export class BrandingError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "BrandingError";
    this.status = status;
  }
}

export const logoPrefix = (tenantId: string) => `branding/${tenantId}/`;

/** The shape both the portal and the report use. Pure. */
export function brandingView(row: { displayName: string | null; logoKey: string | null; primaryColor: string | null; accentColor: string | null; reportFooter: string | null; customDomain: string | null } | null): Branding {
  return {
    displayName: row?.displayName ?? null,
    logoUrl: row?.logoKey ? publicObjectUrl(row.logoKey) : null,
    primaryColor: row?.primaryColor ?? null,
    accentColor: row?.accentColor ?? null,
    reportFooter: row?.reportFooter ?? null,
    customDomain: row?.customDomain ?? null,
  };
}

const SELECT = { displayName: true, logoKey: true, primaryColor: true, accentColor: true, reportFooter: true, customDomain: true } as const;

export async function readBranding(actor: Actor): Promise<Branding> {
  const row = await prisma.tenantBranding.findFirst({
    where: { ...whereFor(actor, "tenantBranding", "read"), tenantId: actor.tenantId }, select: SELECT,
  });
  return brandingView(row);
}

/** Whether the caller may change its tenant's branding — so the branding
 *  screen shows a form or a read-only view up front (2S7-FE-03). */
export async function mayWriteBranding(actor: Actor): Promise<boolean> {
  try {
    await assertMayWrite(actor);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}

/** `own` (a property manager) may brand only an outside organisation's tenant — never the operator's. */
async function assertMayWrite(actor: Actor) {
  const scope = assertAllowed(actor, "tenantBranding", "write");
  if (scope === "own") {
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { operatorTenantId: true } });
    if (!tenant?.operatorTenantId) throw new ForbiddenError("tenantBranding", "write");
  }
}

export async function updateBranding(actor: Actor, input: BrandingInput): Promise<Branding> {
  await assertMayWrite(actor);
  for (const [k, v] of [["primaryColor", input.primaryColor], ["accentColor", input.accentColor]] as const) {
    if (v != null && !HEX.test(v)) throw new BrandingError(`${k}: a #RRGGBB colour.`);
  }
  if (input.logoKey != null && (!input.logoKey.startsWith(logoPrefix(actor.tenantId)) || input.logoKey.includes(".."))) {
    throw new BrandingError("logoKey: not this tenant's upload — request one with POST /branding/logo.");
  }
  const domain = input.customDomain?.trim().toLowerCase() || null;
  if (input.customDomain !== undefined && domain && !HOST.test(domain)) throw new BrandingError("customDomain: a host name such as partners.example.com.");
  if (domain && /(^|\.)sponsorx\.net$/.test(domain)) throw new BrandingError("customDomain: must be the organisation's own domain.");

  const data = {
    ...(input.displayName !== undefined ? { displayName: input.displayName?.trim() || null } : {}),
    ...(input.logoKey !== undefined ? { logoKey: input.logoKey } : {}),
    ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
    ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
    ...(input.reportFooter !== undefined ? { reportFooter: input.reportFooter?.trim() || null } : {}),
    ...(input.customDomain !== undefined ? { customDomain: domain } : {}),
    updatedBy: actor.userId,
  };
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.tenantBranding.upsert({
        where: { tenantId: actor.tenantId }, create: { tenantId: actor.tenantId, ...data }, update: data, select: SELECT,
      });
      await audit(tx, actor, "branding.update", "TenantBranding", actor.tenantId, { after: { ...row } });
      return brandingView(row);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new BrandingError("That domain is already claimed by another organisation.", 409);
    throw error;
  }
}

/** A public-bucket upload grant for a new logo, under this tenant's prefix. */
export async function requestLogoUpload(actor: Actor, input: { contentType: keyof typeof LOGO_TYPES; bytes: number }) {
  await assertMayWrite(actor);
  if (!(input.contentType in LOGO_TYPES)) throw new BrandingError("A logo is PNG or JPEG.");
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_LOGO_BYTES) throw new BrandingError("A logo is at most 1 MB.");
  const logoKey = `${logoPrefix(actor.tenantId)}logo-${randomBytes(8).toString("hex")}.${LOGO_TYPES[input.contentType]}`;
  return { logoKey, uploadUrl: await presignPublicUpload(logoKey, input.contentType), logoUrl: publicObjectUrl(logoKey) };
}
