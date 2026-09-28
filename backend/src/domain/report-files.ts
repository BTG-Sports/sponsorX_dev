/**
 * Server-rendered sponsor reports — the request and the read (2S7-BE-02).
 *
 * The render itself is a worker job (worker/jobs/render-report.mts): Chromium
 * on the worker, the file into the PRIVATE bucket, a ReportFile row to find
 * it. A report is required in two ways — a campaign completing (the renewal
 * hand-off, queued by campaign.ts in the same transaction) or BTG asking.
 * Reading one is an audited, time-limited private grant, like every other
 * object in that bucket.
 */
import { prisma } from "../db/client";
import { enqueue } from "../db/outbox";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presignPrivateDownload } from "../lib/storage";

export type RenderReportJob = { campaignId: string; trigger: "COMPLETED" | "REQUESTED"; requestedBy: string | null };

/** POST /campaigns/:id/report/render — BTG asks for a file now. */
export async function requestReportRender(actor: Actor, campaignId: string): Promise<{ queued: true }> {
  assertTenantWide(actor, "sponsorReport", "write");
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "read"), id: campaignId }, select: { id: true },
    });
    if (!campaign) throw new ForbiddenError("sponsorReport", "write");
    await enqueue(tx, actor.tenantId, "report.render", { campaignId, trigger: "REQUESTED", requestedBy: actor.userId } satisfies RenderReportJob);
    await audit(tx, actor, "sponsorReport.requestRender", "Campaign", campaignId, {});
    return { queued: true };
  });
}

/** GET /campaigns/:id/report/files — the rendered files, each with an
 *  audited 15-minute download link. */
export async function listReportFiles(actor: Actor, campaignId: string) {
  assertAllowed(actor, "sponsorReport", "read");
  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId }, select: { id: true },
  });
  if (!campaign) throw new ForbiddenError("sponsorReport", "read");
  const rows = await prisma.reportFile.findMany({
    where: { ...whereFor(actor, "sponsorReport", "read"), campaignId },
    select: { id: true, r2Key: true, bytes: true, trigger: true, renderedAt: true },
    orderBy: { renderedAt: "desc" },
  });
  return Promise.all(rows.map(async ({ r2Key, ...r }) => ({
    ...r,
    downloadUrl: await presignPrivateDownload(actor, r2Key, { entity: "ReportFile", entityId: r.id }),
  })));
}
