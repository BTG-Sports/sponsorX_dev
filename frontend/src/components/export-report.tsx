"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminAnalyticsReport } from "@/lib/analytics-report-data";
import type { CampaignRoiReport } from "@/lib/campaign-report-data";
import type { AthleteEarningsReport } from "@/lib/earnings-report-data";
import type { SponsorReport } from "@/lib/report-data";

/* --------------------------------------------------------------------------
   ExportReport — the "Export report" button as a small client island, shared
   by the sponsor dashboard and the campaign ROI report. A dropdown offers the
   two formats the client reads: a print-ready PDF and a pivotable XLSX
   workbook. The payload kind picks the renderer pair, and every renderer is
   dynamic-imported on click, so jspdf/exceljs stay out of the page bundles.

   Phase 1 renders in the browser from the same report model the page draws
   from; when the render-report worker lands (§19), this island keeps its
   contract and swaps generation for a queued job + signed R2 download.
   -------------------------------------------------------------------------- */

export type ExportPayload =
  | { kind: "sponsor-dashboard"; report: SponsorReport }
  | { kind: "campaign-roi"; report: CampaignRoiReport }
  | { kind: "athlete-earnings"; report: AthleteEarningsReport }
  | { kind: "admin-analytics"; report: AdminAnalyticsReport };

type Format = "pdf" | "xlsx";

const FORMATS: {
  key: Format;
  label: string;
  hint: string;
}[] = [
  { key: "pdf", label: "PDF report", hint: "Print-ready summary (.pdf)" },
  { key: "xlsx", label: "Excel workbook", hint: "Pivotable data workbook (.xlsx)" },
];

async function generate(payload: ExportPayload, format: Format): Promise<Blob> {
  switch (payload.kind) {
    case "sponsor-dashboard": {
      if (format === "pdf") {
        const { generateReportPdf } = await import("@/lib/report-pdf");
        return generateReportPdf(payload.report);
      }
      const { generateReportXlsx } = await import("@/lib/report-xlsx");
      return generateReportXlsx(payload.report);
    }
    case "campaign-roi": {
      if (format === "pdf") {
        const { generateCampaignReportPdf } = await import("@/lib/campaign-report-pdf");
        return generateCampaignReportPdf(payload.report);
      }
      const { generateCampaignReportXlsx } = await import("@/lib/campaign-report-xlsx");
      return generateCampaignReportXlsx(payload.report);
    }
    case "athlete-earnings": {
      if (format === "pdf") {
        const { generateEarningsReportPdf } = await import("@/lib/earnings-report-pdf");
        return generateEarningsReportPdf(payload.report);
      }
      const { generateEarningsReportXlsx } = await import("@/lib/earnings-report-xlsx");
      return generateEarningsReportXlsx(payload.report);
    }
    case "admin-analytics": {
      if (format === "pdf") {
        const { generateAnalyticsReportPdf } = await import("@/lib/analytics-report-pdf");
        return generateAnalyticsReportPdf(payload.report);
      }
      const { generateAnalyticsReportXlsx } = await import("@/lib/analytics-report-xlsx");
      return generateAnalyticsReportXlsx(payload.report);
    }
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportReport({ payload }: { payload: ExportPayload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function exportAs(format: Format) {
    setBusy(format);
    setError(false);
    try {
      const blob = await generate(payload, format);
      download(blob, `${payload.report.meta.fileStem}.${format}`);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
      >
        Export report
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export format"
          className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => exportAs(f.key)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span>
                <span className="block text-[11px] font-medium text-text">
                  {busy === f.key ? "Preparing…" : f.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-faint">
                  {f.hint}
                </span>
              </span>
              {busy === f.key && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.2-8.56" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
          {error && (
            <p className="border-t border-line px-3 py-2 text-[10px] text-warn">
              Export failed — try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
