/**
 * `report.render` — the sponsor report as a file, with no browser open
 * (2S7-BE-02).
 *
 * Same data as screen 12 (`buildSponsorReport`, scoped here by the job's own
 * tenant), same sections and provenance labels (`renderReportHtml`), printed
 * by Chromium, stored in the PRIVATE bucket, recorded as a ReportFile.
 * Dependencies are passed in so the test can run the handler as written.
 */
import { buildSponsorReport } from "../../src/domain/sponsor-report.ts";
import { renderPdf, renderReportHtml, reportKey, type ReportBrand } from "../../src/domain/report-render.ts";
import type { RenderReportJob } from "../../src/domain/report-files.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";

export type RenderDeps = {
  db: PrismaClient;
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  pdf?: (html: string) => Promise<Buffer>;
  now?: () => Date;
  /** 2S7-BE-01 — reads a logo's bytes from the public bucket. */
  logo?: (key: string) => Promise<Buffer | null>;
};

/** The campaign tenant's branding, with its logo embedded (the render fetches nothing). */
async function brandFor(deps: RenderDeps, tenantId: string): Promise<ReportBrand> {
  const row = await deps.db.tenantBranding.findUnique({
    where: { tenantId },
    select: { displayName: true, logoKey: true, primaryColor: true, accentColor: true, reportFooter: true },
  });
  if (!row) return {};
  let logoDataUri: string | null = null;
  if (row.logoKey && deps.logo) {
    const bytes = await deps.logo(row.logoKey);
    if (bytes) logoDataUri = `data:image/${row.logoKey.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
  }
  return { name: row.displayName, logoDataUri, primaryColor: row.primaryColor, accentColor: row.accentColor, footer: row.reportFooter };
}

export async function handleRenderReport(
  deps: RenderDeps,
  job: RenderReportJob & { tenantId: string },
): Promise<{ status: "rendered"; key: string; bytes: number } | { status: "skipped"; reason: string }> {
  const report = await buildSponsorReport({ tenantId: job.tenantId, id: job.campaignId });
  if (!report) return { status: "skipped", reason: "no such campaign in this tenant" };
  const at = (deps.now ?? (() => new Date()))();
  const pdf = await (deps.pdf ?? renderPdf)(renderReportHtml(report, at, await brandFor(deps, job.tenantId)));
  const key = reportKey(job.campaignId, at);
  await deps.put(key, pdf, "application/pdf");
  await deps.db.reportFile.create({
    data: {
      tenantId: job.tenantId, campaignId: job.campaignId, r2Key: key, bytes: pdf.length,
      trigger: job.trigger, requestedBy: job.requestedBy, renderedAt: at,
    },
    select: { id: true },
  });
  return { status: "rendered", key, bytes: pdf.length };
}
