/**
 * The sponsor report, rendered unattended — 2S7-BE-02.
 *
 * For when a report file must exist without anyone opening a browser: the
 * renewal hand-off when a campaign completes, or BTG asking for one. The
 * interactive path is unchanged — the sponsor's own browser print of screen
 * 12 (the web app's report-pdf.ts).
 *
 * SAME DATA AS SCREEN 12. The worker calls `buildSponsorReport`, the very
 * function behind GET /campaigns/{id}/report, and lays out the same sections
 * in the same order. EVERY PROVENANCE LABEL IS KEPT: each number carries the
 * label the screen gives it, in the screen's own words (`SOURCE_LABEL`,
 * checked against the web app's copy by tests/report-render.test.ts).
 * Reach layers stay side by side and are never summed, as on screen (§22).
 *
 * Rendered by Chromium through playwright-core: the HTML below is printed to
 * A4 PDF. The browser runs as its own process, launched per job and closed
 * after, so the shared API/worker event loop (src/combined.mts) only waits on it.
 */
import type { SponsorReport } from "./sponsor-report";

/** The screen's wording for each provenance, verbatim (web ui.tsx SourceLabel). */
export const SOURCE_LABEL = {
  VERIFIED_SYSTEM: "measured",
  VERIFIED_API: "verified · platform",
  VERIFIED_MANUAL: "verified · manual",
  SELF_REPORTED: "self-reported",
  ESTIMATED: "estimated",
  ATTRIBUTED: "attributed",
} as const;
export type Source = keyof typeof SOURCE_LABEL;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number) => v.toLocaleString("en-US");
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const rate = (views: number, eng: number) => (views > 0 ? `${Math.round((1000 * eng) / views) / 10}% rate` : "");
const chip = (s: Source) => `<span class="chip chip-${s.toLowerCase()}" data-source="${s}">${SOURCE_LABEL[s]}</span>`;

/** Every provenance label the rendered file carries, for the report given —
 *  the same set screen 12 shows for it. */
export function labelsFor(r: SponsorReport): Source[] {
  return [
    "VERIFIED_API", "SELF_REPORTED", "ESTIMATED", // the three reach layers
    "ESTIMATED", // media value
    "ATTRIBUTED", // link clicks
    "VERIFIED_SYSTEM", // redemption
    ...(r.deliveredAssets.length ? (["ATTRIBUTED"] as Source[]) : []),
    ...(r.adPlacements.length && r.editionEngagement ? (["VERIFIED_SYSTEM"] as Source[]) : []),
  ];
}

export function renderReportHtml(r: SponsorReport, renderedAt = new Date()): string {
  const p = r.performance;
  const layers: Array<[string, number, number, Source]> = [
    ["Verified", p.verifiedViews, p.verifiedEngagements, "VERIFIED_API"],
    ["Self-reported", p.views.SELF_REPORTED, p.engagements.SELF_REPORTED, "SELF_REPORTED"],
    ["Estimated", p.views.ESTIMATED, p.engagements.ESTIMATED, "ESTIMATED"],
  ];
  const verified = r.roster.reduce((s, l) => s + l.deliverablesVerified, 0);
  const total = r.roster.reduce((s, l) => s + l.deliverablesTotal, 0);
  const clicks = r.deliveredAssets.reduce((s, a) => s + a.trackedClicks, 0);
  const f = r.funnel;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Campaign ROI Report — ${esc(r.campaign.name)}</title>
<style>
  @page{size:A4;margin:18mm 16mm}
  body{font:12px/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#141414}
  h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  .muted{color:#666}.faint{color:#888;font-size:10px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .card{border:1px solid #ddd;border-radius:6px;padding:10px 12px}
  .big{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
  .chip{display:inline-block;font-size:9px;padding:1px 6px;border-radius:9px;border:1px solid #bbb;margin-left:6px;vertical-align:middle}
  .chip-self_reported{border-color:#c80;color:#8a5a00}.chip-estimated{color:#555}
  table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px solid #eee}td.r{text-align:right}
</style></head><body>
<h1>Campaign ROI Report</h1>
<p class="muted">${esc(r.campaign.name)} · ${day(r.campaign.startDate)} – ${day(r.campaign.endDate)} · ${esc(r.campaign.state.toLowerCase())}</p>
${r.objective ? `<p class="faint">Objective: ${esc(r.objective)}</p>` : ""}

<h2>Reach, by how we know it</h2>
<div class="grid">${layers.map(([label, v, e, s]) => `
  <div class="card"><div class="muted">${label} views ${chip(s)}</div><div class="big">${n(v)}</div>
  <div class="faint">${n(e)} engagements${rate(v, e) ? ` · ${rate(v, e)}` : ""}</div></div>`).join("")}
</div>
<p class="faint">Each layer stands alone — a self-reported or estimated view is never added to a verified one (§22).</p>

<div class="grid" style="margin-top:12px">
  <div class="card"><div class="muted">Media value ${chip("ESTIMATED")}</div><div class="big">${usd(r.mediaValue.amount)}</div><div class="faint">${esc(r.mediaValue.basis)}</div></div>
  <div class="card"><div class="muted">Delivery</div><div class="big">${verified} <span class="muted">of ${total} verified</span></div><div class="faint">deliverables confirmed live by BTG</div></div>
  <div class="card"><div class="muted">Link clicks ${chip("ATTRIBUTED")}</div><div class="big">${n(clicks)}</div><div class="faint">counted on our own tracking links, not a platform figure</div></div>
</div>

<h2>Reward funnel</h2>
<p class="faint">Four separate events from the fan page — measured by SponsorX (§16).</p>
<table><tr><td>Scan</td><td class="r">${n(f.SCAN)}</td></tr><tr><td>Landing</td><td class="r">${n(f.LANDING)}</td></tr><tr><td>Claim</td><td class="r">${n(f.CLAIM)}</td></tr><tr><td>Redeem</td><td class="r">${n(f.REDEEM)}</td></tr></table>
<p class="muted">${n(r.redemption.redeemed)} redeemed of ${n(r.redemption.issued)} issued${r.redemption.issued ? ` · ${Math.round(r.redemption.rate * 1000) / 10}%` : ""} ${chip("VERIFIED_SYSTEM")}</p>

${r.observations.length ? `<h2>What stands out</h2><ul>${r.observations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}

<h2>Roster delivery</h2>
${r.roster.length === 0 ? `<p class="muted">No athletes on this campaign yet.</p>` : `<table>${r.roster.map((l) => `
  <tr><td><b>${esc(l.athleteName)}</b> <span class="faint">${esc(l.jobId)} · ${esc(l.orderState.toLowerCase())}</span></td><td class="r">${l.deliverablesVerified}/${l.deliverablesTotal} verified</td></tr>`).join("")}</table>`}

<h2>Published content</h2>
${r.deliveredAssets.length === 0 ? `<p class="muted">Nothing published yet.</p>` : `<table>${r.deliveredAssets.map((a) => `
  <tr><td><b>${esc(a.title)}</b>${a.publishedAt ? ` <span class="faint">${day(a.publishedAt)}</span>` : ""}</td><td class="r">${n(a.trackedClicks)} clicks ${chip("ATTRIBUTED")}</td></tr>`).join("")}</table>`}

${r.adPlacements.length && r.editionEngagement ? `<h2>Edition placements</h2>
<p class="faint">Print and digital kept apart — pooling them would say something untrue.</p>
<p class="muted">${r.adPlacements.length} position${r.adPlacements.length === 1 ? "" : "s"} · ${n(r.editionEngagement.print.QR_SCAN)} print QR scans · ${n(r.editionEngagement.digital.LINK_CLICK)} digital link clicks ${chip("VERIFIED_SYSTEM")}</p>` : ""}

<p class="faint" style="margin-top:28px">Rendered by SponsorX on ${day(renderedAt)} from the same figures as the live report.</p>
</body></html>`;
}

/** Where a rendered report lives in the private bucket. */
export function reportKey(campaignId: string, at: Date): string {
  return `reports/${campaignId}/${at.toISOString().replace(/[:.]/g, "-")}.pdf`;
}

/**
 * HTML → PDF in headless Chromium. `CHROMIUM_PATH` points at the system
 * Chromium in the server image (Alpine's package — Playwright's bundled
 * build does not run on musl); unset, playwright-core uses its own download,
 * as in local development and CI.
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    /* No network: the HTML is self-contained, and a report must not fetch. */
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    await browser.close();
  }
}
